import { z } from 'zod';

const schema = z.string();
console.log(schema.safeParse("test").success); // true
console.log("Zod is working!");
