/**
 * Runs the in-memory S3 stub as a standalone process for local end-to-end
 * checks of uploads without an R2 account:
 *
 *   npx tsx scripts/s3-stub.ts            → prints the endpoint
 *   R2_ENDPOINT=<that> R2_ACCOUNT_ID=x R2_ACCESS_KEY_ID=x R2_SECRET_ACCESS_KEY=x R2_BUCKET=bloom-test npm run dev
 */
import { startS3Stub } from "../src/test/s3-stub";

const port = Number(process.env.S3_STUB_PORT ?? 9000);
const stub = await startS3Stub(process.env.R2_BUCKET ?? "bloom-test");
console.log(
  `[s3-stub] serving bucket "${process.env.R2_BUCKET ?? "bloom-test"}" at ${stub.url} (memory only)`
);
void port;
process.on("SIGINT", async () => {
  await stub.close();
  process.exit(0);
});
