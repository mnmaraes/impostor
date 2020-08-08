import { Model, curve, unique, word, paragraph } from "./mod.ts";

export const definitions = new Model().addModel(
  "stock",
  {
    id: unique("string"),
    name: word({ countRange: [2, 5] }),
    description: paragraph(),
    latestTradingDay: curve({
      numOfPoints: 450,
      variationRange: 0.001,
      initialRange: [5, 1000],
    }),
  },
  { preview: ["name", "description", "latestTradingDay"] }
);

if (import.meta.main) {
  definitions.run();
}
