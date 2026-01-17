import asyncio
import aiohttp
import json
import os
import sys
from pathlib import Path

BASE_URL = "http://localhost:8000/api"

async def test_chat_scenarios():
    async with aiohttp.ClientSession() as session:
        print("\n=== Testing Artwork Chat Scenarios ===\n")

        # 1. Test Failure: Neither image nor artwork_id
        print("Scenario 1: Testing failure when both image and artwork_id are missing...")
        data = aiohttp.FormData()
        data.add_field('query', 'Who is the artist?')
        async with session.post(f"{BASE_URL}/artwork-chat", data=data) as resp:
            status = resp.status
            result = await resp.json()
            if status == 400:
                print(f"✓ Correctly failed with 400: {result.get('detail')}")
            else:
                print(f"✗ FAILED: Expected 400, got {status}: {result}")

        # 2. Test Success with image (existing behavior)
        print("\nScenario 2: Testing chat with image (upload)...")
        # Find an image
        image_dir = Path("testing/images")
        image_path = next(image_dir.glob("*.jpeg"))
        
        data = aiohttp.FormData()
        data.add_field('image', open(image_path, 'rb'), filename=image_path.name)
        data.add_field('query', 'What is the style of this piece?')
        async with session.post(f"{BASE_URL}/artwork-chat", data=data) as resp:
            if resp.status == 200:
                result = await resp.json()
                print(f"✓ Success: {result.get('response')[:50]}...")
            else:
                print(f"✗ FAILED: Status {resp.status}")

        # 3. Test Session-based chat (artwork_id)
        # First, analyze an image to get an artwork_id
        print("\nScenario 3: Testing session-based chat with artwork_id...")
        print("Step 3.1: Analyzing artwork to create session...")
        data = aiohttp.FormData()
        data.add_field('image', open(image_path, 'rb'), filename=image_path.name)
        data.add_field('user_id', 'test_user_session')
        data.add_field('client_type', 'web') # Ensure it saves to disk
        
        artwork_id = None
        async with session.post(f"{BASE_URL}/artwork-analyze", data=data) as resp:
            if resp.status == 200:
                result = await resp.json()
                artwork_id = result.get('artwork_id')
                print(f"✓ Saved artwork with ID: {artwork_id}")
            else:
                print(f"✗ FAILED to analyze: {resp.status}")
                return

        if artwork_id:
            print(f"Step 3.2: Sending chat query with artwork_id={artwork_id} and NO image...")
            data = aiohttp.FormData()
            data.add_field('artwork_id', artwork_id)
            data.add_field('query', 'Tell me more about its colors.')
            
            async with session.post(f"{BASE_URL}/artwork-chat", data=data) as resp:
                if resp.status == 200:
                    result = await resp.json()
                    print(f"✓ Success: {result.get('response')[:50]}...")
                else:
                    print(f"✗ FAILED session chat: {resp.status}")
                    print(await resp.text())

if __name__ == "__main__":
    # Ensure we are in the backend directory
    if Path("app").exists() and Path("testing").exists():
        asyncio.run(test_chat_scenarios())
    else:
        print("Please run this script from the backend directory.")
