from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
import os

app = FastAPI()

STATIC_DIR = os.path.join(os.path.dirname(__file__), "/app/frontend/build")
index_file = os.path.join(STATIC_DIR, "index.html")

# Монтируем статику отдельно
app.mount("/static", StaticFiles(directory=os.path.join(STATIC_DIR, "static")), name="static")

@app.get("/api/hello")
def hello(request: Request, domain: str = "", path: str = ""):
    route = path.strip("/")
    greetings = {
        "": "Welcome! Choose your destination below 👇",
        "cat": "Welcome to the 🐱 cat zone!",
        "dog": "Bark bark! 🐶 You found the dog zone!",
        "space": "🚀 Greetings from outer space, astronaut!",
        "party": "🎉 Party time! Let's celebrate your arrival!",
    }
    msg = greetings.get(route, f"👋 Hello! You are at /{route}")
    return JSONResponse(content={"message": msg})

# SPA fallback для всех маршрутов
@app.get("/{full_path:path}")
async def spa_handler(full_path: str):
    return FileResponse(index_file)
