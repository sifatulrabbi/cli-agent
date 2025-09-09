_model_with_reasoning = [
    "gpt-5",
    "gpt-5-mini",
    "gpt-5-nano",
    "o4-mini",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
]
_openai_models = [
    "gpt-5",
    "gpt-5-mini",
    "gpt-5-nano",
    "o4-mini",
    "gpt-4.1",
    "gpt-4.1-mini",
]


def get_model_reasoning_param(model_name: str):
    if model_name not in _model_with_reasoning:
        return None
    return {"effort": "medium", "summary": "auto"}


def get_model_output_version(model_name: str):
    if model_name in _openai_models:
        return "responses/v1"
    return "v0"
