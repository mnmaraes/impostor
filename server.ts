import { Application, Router, helpers } from "https://deno.land/x/oak/mod.ts";

import { Model } from "./impostor.ts";

type Paginated = {
  size: number;
  page: number;
};

const failableParseInt = (possibleInt: string): number | null => {
  const v = parseInt(possibleInt);
  if (isNaN(v)) {
    return null;
  }

  return v;
};

const getPaginated = (ctx: any): Paginated => {
  const qry = helpers.getQuery(ctx, { mergeParams: true });

  return {
    size: failableParseInt(qry.size) ?? 10,
    page: failableParseInt(qry.page) ?? 0,
  };
};

export const serve = async (model: Model, port: number) => {
  const models = model.modelNames();

  const router = new Router();
  models.forEach((modelName) => {
    router.get(`/${modelName}`, (ctx) => {
      const { size, page } = getPaginated(ctx);

      ctx.response.body = model.getModel(modelName, {
        type: "index",
        skipFirst: size * page,
        count: size,
      });
    });

    router.get(`/${modelName}/:id`, (ctx) => {
      const id = ctx.params?.id;

      if (id == null) {
        ctx.response.status = 400;
        ctx.response.body = {};
        return;
      }

      const res = model.getModel(modelName, { type: "id", id });
      if (res == null) {
        ctx.response.status = 404;
        ctx.response.body = {};
        return;
      }

      ctx.response.body = res;
    });
  });

  const app = new Application();
  app.use(router.routes());
  app.use(router.allowedMethods());

  await app.listen({ port });
};
