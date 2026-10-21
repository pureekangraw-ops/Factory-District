import { WorkerEntrypoint } from 'cloudflare:workers';
import { createEdgeCodeProvider, createEdgeVisualProvider } from './edge-providers.mjs';
export class CodeProvider extends WorkerEntrypoint {
  inspectRepository(input) { return createEdgeCodeProvider(this.env).inspectRepository(input); }
  planChange(input) { return createEdgeCodeProvider(this.env).planChange(input); }
  executeChange(input) { return createEdgeCodeProvider(this.env).executeChange(input); }
  runTests(input) { return createEdgeCodeProvider(this.env).runTests(input); }
  build(input) { return createEdgeCodeProvider(this.env).build(input); }
  inspectArtifact(input) { return createEdgeCodeProvider(this.env).inspectArtifact(input); }
  ciCheckpoint(input) { return createEdgeCodeProvider(this.env).ciCheckpoint(input); }
  deploy(input) { return createEdgeCodeProvider(this.env).deploy(input); }
  verifyRuntime(input) { return createEdgeCodeProvider(this.env).verifyRuntime(input); }
}
export class VisualProvider extends WorkerEntrypoint {
  inspectInput(input) { return createEdgeVisualProvider(this.env).inspectInput(input); }
  interpretDesign(input) { return createEdgeVisualProvider(this.env).interpretDesign(input); }
  compose(input) { return createEdgeVisualProvider(this.env).compose(input); }
  createOrEdit(input) { return createEdgeVisualProvider(this.env).createOrEdit(input); }
  render(input) { return createEdgeVisualProvider(this.env).render(input); }
  inspectVisual(input) { return createEdgeVisualProvider(this.env).inspectVisual(input); }
  compare(input) { return createEdgeVisualProvider(this.env).compare(input); }
  correct(input) { return createEdgeVisualProvider(this.env).correct(input); }
  exportOutput(input) { return createEdgeVisualProvider(this.env).exportOutput(input); }
  verifyFinalOutput(input) { return createEdgeVisualProvider(this.env).verifyFinalOutput(input); }
}
export default { fetch() { return new Response('SERVICE_BINDING_ONLY', { status: 403 }); } };
