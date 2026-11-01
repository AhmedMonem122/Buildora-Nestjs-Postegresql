// Vercel's Node runtime bundles this entry point. It imports the pre-compiled
// Nest output so decorator metadata emitted by `nest build` is preserved.
import handler from '../dist/serverless.js';

export default handler;
