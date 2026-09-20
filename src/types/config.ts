export interface ExtensionConfig {
  timeoutMs: number;
}

export interface ValidationResult {
  isValid: boolean;
  errorMessage?: string;
}
