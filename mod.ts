import { Command } from "https://deno.land/x/cliffy/command.ts";
import { exec } from "https://deno.land/x/exec/mod.ts";

import { v4 } from "https://deno.land/std/uuid/mod.ts";
import { ensureFile } from "https://deno.land/std@0.63.0/fs/mod.ts";

import { serve } from "./server.ts";

import words from "./samples/words.ts";
import paragraphs from "./samples/paragraphs.ts";
import addresses from "./samples/addresses.ts";

const getRandom = (fromArray: string[]): string => {
  return fromArray[Math.round(Math.random() * (fromArray.length - 1))];
};

const sample = (
  count: number,
  fromArray: string[],
  join: string = " "
): string => {
  return [...new Array(count)].map(() => getRandom(fromArray)).join(join);
};

type FieldType = string;

type OwnsOptions = {
  type: string;
  countRange: [number, number];
};

type ModelOptions = {
  preview?: string[];
  maxCount?: number;
  owns?: OwnsOptions;
};

type FieldDependencies = {
  [modelName: string]: string[] | "full";
};

type FieldDefinition = {
  type: FieldType | ((definitions: any) => FieldType);
  builder: Function;
  dependencies?: FieldDependencies;
};

type ModelFields = { [name: string]: FieldDefinition };

type ModelDefinition = {
  fields: ModelFields;
  options?: ModelOptions;
};

type FieldCreators = { [fieldName: string]: FieldDefinition };

type FetchOtions =
  | {
      type: "index";
      skipFirst: number;
      count: number;
    }
  | {
      type: "id";
      id: string;
    };

type LoadedObject = {
  state: "id" | "preview" | "loaded";
  value: any;
};

export class Model {
  private _templates: { [name: string]: ModelDefinition } = {};

  private _typeDefinitions: {
    [modelName: string]: { [fieldName: string]: string };
  } = {};

  private _associatedTypeDefinitions: {
    [typeName: string]: string;
  } = {};

  private _realizedTypes: string[] = [];

  private genTypes = (): Command => {
    return new Command()
      .description(
        "Generates a typescript file with that defines the mocked Models"
      )
      .option(
        "-o, --output [output:string]",
        "The file to output the type definitions. If ommited types will be printed to stdout"
      )
      .action(async ({ output }: { output: string }) => {
        const typeString =
          Object.keys(this._typeDefinitions)
            .map((modelName) => {
              const modelType = this._typeDefinitions[modelName];
              const fields = Object.keys(modelType)
                .map((fieldName) => `\t${fieldName}: ${modelType[fieldName]}`)
                .join(";\n");

              return `type ${
                modelName.charAt(0).toUpperCase() + modelName.slice(1)
              } = {\n${fields}\n}`;
            })
            .join("\n") +
          "\n" +
          Object.keys(this._associatedTypeDefinitions)
            .map(
              (typeName) =>
                `type ${typeName} = ${this._associatedTypeDefinitions[typeName]}`
            )
            .join("\n");

        if (output != null) {
          await ensureFile(output);
          await Deno.writeTextFile(output, typeString);
          await exec(`deno fmt ${output}`);
        } else {
          console.log(typeString);
        }
      });
  };

  private serve = () => {
    return new Command()
      .description(
        "Generates a typescript file with that defines the mocked Models"
      )
      .option(
        "-p, --port [port:number]",
        "The file to output the type definitions. If ommited types will be printed to stdout",
        { default: 3001 }
      )
      .action(async ({ port }: { port: number }) => {
        await serve(this, port);
      });
  };

  private realizeTypes = () => {
    const models = Object.keys(this._templates);

    while (models.length > this._realizedTypes.length) {
      var madeProgress = false;

      models.forEach((modelName) => {
        const current = this._typeDefinitions[modelName] ?? {};
        const fields = this._templates[modelName].fields;
        Object.keys(fields).forEach((fieldName) => {
          if (current[fieldName] != null) return;
          const definition = fields[fieldName].type;
          if (typeof definition === "string") {
            current[fieldName] = definition;
            madeProgress = true;
            return;
          }

          try {
            current[fieldName] = definition(this._typeDefinitions);
            madeProgress = true;
          } catch (error) {}
        });

        this._typeDefinitions[modelName] = current;

        if (
          Object.keys(this._typeDefinitions[modelName]).length ===
            Object.keys(this._templates[modelName].fields).length &&
          !this._realizedTypes.includes(modelName)
        ) {
          this._realizedTypes.push(modelName);
          this.realizeAssociatedTypes(modelName);
        }
      });

      if (!madeProgress) {
        throw new Error("Unresolvable Type Definitions");
      }
    }
  };

  private realizeAssociatedTypes = (modelName: string) => {
    const preview = this._templates[modelName].options?.preview;

    if (preview == null || preview.length == 0) {
      return;
    }

    const previewTypeName = `${
      modelName.charAt(0).toUpperCase() + modelName.slice(1)
    }Preview`;
    const fields = preview!
      .map((field) => `${field}: ${this._typeDefinitions[modelName][field]}`)
      .join(";");

    this._associatedTypeDefinitions[previewTypeName] = `{ ${fields} }`;
  };

  addModel = (
    modelName: string,
    definition: FieldCreators,
    options?: ModelOptions
  ): Model => {
    if (this._templates[modelName] != null) {
      throw new Error(`Model ${modelName} redefined`);
    }

    this._templates[modelName] = {
      fields: create(definition),
      options,
    };

    return this;
  };

  private _owner: { [ownedId: string]: string } = {};
  private _owned: { [ownerId: string]: string[] } = {};
  private _relationships: {
    [relType: string]: { [modelName: string]: string };
  } = {};

  realizeRelationships = () => {
    Object.keys(this._templates).forEach((modelName) => {
      const owns = this._templates[modelName].options?.owns;
      if (owns == null) return;

      if (this._relationships["owns"] == null) {
        this._relationships["owns"] = {};
      }
      this._relationships["owns"][modelName] = owns.type;

      if (this._relationships["owned"] == null) {
        this._relationships["owned"] = {};
      }
      this._relationships["owned"][owns.type] = modelName;
    });
  };

  run = () => {
    this.realizeTypes();
    this.realizeRelationships();

    const command = new Command()
      .description("A type and relationship aware server mocker")
      .command("genTypes", this.genTypes())
      .command("serve", this.serve());

    command.parse(Deno.args);
  };

  modelNames = (): string[] => {
    return Object.keys(this._templates);
  };

  private _loadedObjects: {
    [modelName: string]: { [id: string]: LoadedObject };
  } = {};

  private load = (
    modelName: string,
    state: "id" | "preview" | "loaded",
    modelId?: string
  ): any => {
    if (this._loadedObjects[modelName] == null) {
      this._loadedObjects[modelName] = {};
    }

    const { fields, options } = this._templates[modelName];
    const id = modelId ?? fields.id.builder({}, this._loadedObjects);

    const current = this._loadedObjects[modelName][id]?.value ?? {
      id,
    };

    const fieldsToBuild = {
      loaded: Object.keys(fields),
      preview: ["id", ...(options?.preview ?? [])],
      id: ["id"],
    }[state];

    this._loadedObjects[modelName][id] = {
      state: state,
      value: fieldsToBuild.reduce((acc, field) => {
        if (acc[field] != null) return acc;
        try {
          acc[field] = fields[field].builder(acc, this);
        } catch (e) {
          console.log(e);
          throw e;
        }
        return acc;
      }, current),
    };

    return this._loadedObjects[modelName][id].value;
  };

  getModel = (modelName: string, options: FetchOtions): any => {
    const loaded = this._loadedObjects[modelName] ?? {};

    if (options.type == "id") {
      const { state } = loaded[options.id];
      if (state != "loaded") {
        this.load(modelName, "loaded", options.id);
      }
      return loaded[options.id].value;
    }

    const newCount =
      options.skipFirst + options.count - Object.keys(loaded).length;

    if (newCount > 0) {
      [...new Array(newCount)].forEach(() => this.load(modelName, "id"));
    }

    const ids = Object.keys(this._loadedObjects[modelName]).slice(
      options.skipFirst,
      options.skipFirst + options.count
    );

    return ids.map((id) => this.load(modelName, "preview", id));
  };

  getOwner = (modelName: string, { id }: any): any => {
    var ownerId = this._owner[id];

    return this.load(modelName, "id", ownerId);
  };

  sample = (modelName: string, model: any, options?: any): any[] => {
    const sampleCount = Math.floor(
      getWithinRange(options?.countRange ?? [3, 3])
    );
    const relationship = options?.relationship;

    if (relationship !== "owned") {
      return [...new Array(sampleCount)].map(() =>
        this.load(modelName, "loaded")
      );
    }

    const ownerType = this._relationships["owned"][modelName];
    const { countRange } = this._templates[ownerType].options!.owns!;
    const ownedCount = Math.floor(getWithinRange(countRange));

    const ownedIds = [...new Array(ownedCount)].map(() => {
      const id = this.load(modelName, "id").id;

      this._owner[id] = model.id;

      return id;
    });
    this._owned[model.id] = ownedIds;

    return ownedIds
      .slice(0, sampleCount)
      .map((id) => this.load(modelName, "loaded", id));
  };
}

const create = (definition: FieldCreators): ModelFields => {
  return Object.keys(definition).reduce((acc, fieldName) => {
    return {
      ...acc,
      [fieldName]: definition[fieldName],
    };
  }, {} as ModelFields);
};

var globalCounter = 0;

const getUnique = (idType: "string" | "number"): any => {
  if (idType === "string") return v4.generate();
  return globalCounter++;
};

const getWithinRange = (range: [number, number]): number => {
  return Math.random() * (range[1] - range[0]) + range[0];
};

const getWords = (options?: any): string => {
  return sample(
    Math.floor(getWithinRange(options?.countRange ?? [1, 1])),
    words
  );
};

const getParagraph = (): string => {
  return getRandom(paragraphs);
};

const getAddress = () => {
  return getRandom(addresses);
};

const getCurrency = (options?: any) => {
  return getWithinRange(options?.range ?? [0, 1000]);
};

export const template = (
  field: string,
  callback: (value: any) => string
): FieldDefinition => {
  return {
    type: "string",
    builder: ({ [field]: value }: any) => callback(value),
    dependencies: { self: [field] },
  };
};

export const unique = (idType: "string" | "number"): FieldDefinition => {
  return {
    type: idType,
    builder: () => getUnique(idType),
  };
};

export const word = (options?: any): FieldDefinition => {
  return {
    type: "string",
    builder: () => getWords(options),
  };
};
export const paragraph = (): FieldDefinition => {
  return {
    type: "string",
    builder: () => getParagraph(),
  };
};
export const address = (): FieldDefinition => {
  return {
    type: "string",
    builder: () => getAddress(),
  };
};
export const currency = (options?: any): FieldDefinition => {
  return {
    type: "number",
    builder: () => getCurrency(options),
  };
};

const getOwner = (
  store: Model,
  modelName: string,
  model: any,
  options: any
) => {
  const transform = options?.transform?.apply ?? ((i: any) => i);
  const owner = transform(store.getOwner(modelName, model));

  return owner;
};

const getOwnerDependencies = (options?: any): string[] | "full" => {
  return options?.transform.dependsOn ?? "full";
};

const deriveType = (
  definitions: any,
  modelName: string,
  options?: any
): string => {
  return (
    options?.transform?.resultingType(modelName, definitions) ??
    modelName.charAt(0).toUpperCase() + modelName.slice(1)
  );
};

export const owner = (modelName: string, options: any): FieldDefinition => {
  return {
    type: (definitions: any) => deriveType(definitions, modelName, options),
    builder: (model: any, modelStore: any) =>
      getOwner(modelStore, modelName, model, options),
    dependencies: { [modelName]: getOwnerDependencies(options) },
  };
};

const getSetOf = (
  store: Model,
  modelName: string,
  model: any,
  options?: any
) => {
  return store
    .sample(modelName, model, options)
    .map(options?.transform?.apply ?? ((i: any) => i));
};

export const setOf = (modelName: string, options?: any): FieldDefinition => {
  return {
    type: (definitions: any) =>
      deriveType(definitions, modelName, options) + "[]",
    builder: (model: any, modelStore: any) =>
      getSetOf(modelStore, modelName, model, options),
  };
};

type Transform = {
  dependsOn: string[] | "full";
  resultingType?: (modelName: string, definitions: any) => string;
  apply: (model: any) => any;
};

const getObjectType = (keys: string[]) => (
  modelName: string,
  definitions: any
): string => {
  const fields = keys
    .map((key) => {
      const dependedType = definitions[modelName][key];

      if (dependedType == null) {
        throw "Unresolved";
      }

      return `${key}: ${dependedType}`;
    })
    .join(";");

  return `{ ${fields} }`;
};

export const pick = (keys: string[]): Transform => {
  return {
    dependsOn: keys,
    apply: (model: any) => {
      const result: any = {};

      keys.forEach((key) => {
        result[key] = model[key];
      });

      return result;
    },
    resultingType: getObjectType(keys),
  };
};
