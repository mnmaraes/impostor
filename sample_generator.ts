import { ensureFile, writeJson } from "https://deno.land/std@0.63.0/fs/mod.ts";
import { faker } from "https://deno.land/x/deno_faker@v1.0.0/mod.ts";

// This is necessary because faker needs `net` access for some reason,
// and my momma didn't raise no Bitcoin farm

// Generate Words
const words = [...new Array(1000)].map(() => {
  return faker.random.word();
});

console.log(words);

await ensureFile("./samples/words.json");
await writeJson("./samples/words.json", words, { spaces: 2 });

const paragraphs = [...new Array(1000)].map(() => {
  return faker.lorem.paragraph();
});

console.log(paragraphs);

await ensureFile("./samples/paragraphs.json");
await writeJson("./samples/paragraphs.json", paragraphs, { spaces: 2 });

const addresses = [...new Array(1000)].map(() => {
  return faker.address.streetAddress();
});

console.log(addresses);

await ensureFile("./samples/addresses.json");
await writeJson("./samples/addresses.json", addresses, { spaces: 2 });
