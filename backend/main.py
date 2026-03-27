import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from api.tax import router as tax_router

app = FastAPI(
    title="WealthyWise AI Backend",
    description="LangGraph-powered Indian tax & finance intelligence API",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://wealthywise-beta.vercel.app/",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tax_router, prefix="/api/tax")


@app.get("/")   
async def health():
    return {"status": "ok", "version": "1.0.0"}