FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    UV_SYSTEM_PYTHON=1 \
    WAVEMUSIC_GENERATED_DIR=/tmp/wavemusic

RUN apt-get update \
    && apt-get install -y --no-install-recommends g++ \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml uv.lock setup.py ./
COPY src ./src
COPY scripts ./scripts
COPY sheets ./sheets
COPY main.py ./

RUN pip install --no-cache-dir uv \
    && uv sync --frozen --no-dev \
    && uv run python setup.py build_ext --inplace

EXPOSE 8080

CMD ["uv", "run", "uvicorn", "scripts.web_api:app", "--host", "0.0.0.0", "--port", "8080"]
