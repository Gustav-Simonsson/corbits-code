import { type } from "arktype";

export const ProviderInferenceOptionSchemas = {
  contextWindow: type("number.integer > 0"),
  maxTokens: type("number.integer > 0"),
  temperature: type("0 <= number <= 2"),
  topP: type("0 <= number <= 1"),
};

export const ProviderInferenceOptionsSchema = type({
  "contextWindow?": ProviderInferenceOptionSchemas.contextWindow,
  "maxTokens?": ProviderInferenceOptionSchemas.maxTokens,
  "temperature?": ProviderInferenceOptionSchemas.temperature,
  "topP?": ProviderInferenceOptionSchemas.topP,
}).narrow(
  (options, ctx) =>
    options.temperature === undefined ||
    options.topP === undefined ||
    ctx.mustBe("sampling options with only one of temperature and top p"),
);
