import { ingest } from "../src/lib/ingest";
const days = Number(process.argv[2] ?? 5);
ingest(days).then((r) => console.log(JSON.stringify(r, null, 2)));
