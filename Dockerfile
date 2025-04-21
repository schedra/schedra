FROM node:18 AS base

RUN apt-get update && apt-get install -y python3 python3-pip entr
COPY requirements.txt /app/requirements.txt
RUN pip3 install --break-system-packages -r /app/requirements.txt

WORKDIR /app
COPY app/backend /app/backend
COPY app/frontend /app/frontend
RUN cd /app/frontend && npm install && npm run build

CMD ["python3", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
