declare module "mammoth/mammoth.browser" {
  interface MammothMessage {
    type: string;
    message: string;
  }
  interface MammothResult {
    value: string;
    messages: MammothMessage[];
  }
  interface MammothInput {
    arrayBuffer: ArrayBuffer;
  }
  interface MammothApi {
    convertToHtml(input: MammothInput, options?: Record<string, unknown>): Promise<MammothResult>;
    extractRawText(input: MammothInput): Promise<MammothResult>;
    images: {
      imgElement(handler: (image: unknown) => Promise<{ src: string }>): unknown;
    };
  }
  const mammoth: MammothApi;
  export default mammoth;
}
