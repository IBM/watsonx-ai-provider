export type WatsonxEmbeddingModelId =
  | 'ibm/granite-embedding-107m-multilingual'
  | 'ibm/granite-embedding-278m-multilingual'
  | 'ibm/slate-125m-english-rtrvr-v2'
  | 'ibm/slate-30m-english-rtrvr-v2'
  | (string & {});

export interface WatsonxEmbeddingSettings {
  /**
   * Whether to truncate input text to fit within the model's token limit.
   * When true, inputs exceeding the model's max tokens will be truncated.
   * When false or undefined, long inputs may cause an error.
   */
  truncateInputTokens?: boolean;
}
