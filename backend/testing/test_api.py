#!/usr/bin/env python3
"""
Comprehensive API Test Suite for Musee Backend

Tests all API endpoints with support for both development and production environments.
Randomly selects images from ~/Pictures/museum images for testing.

Usage:
    python test_api.py --mode dev      # Test localhost:8000
    python test_api.py --mode prod     # Test Vercel production API
    python test_api.py --mode prod --url https://your-custom-url.vercel.app
"""

import argparse
import asyncio
import json
import os
import random
import sys
import textwrap
import time
from pathlib import Path
from typing import Optional, List
import aiohttp
from dataclasses import dataclass
from datetime import datetime


@dataclass
class TestConfig:
    """Configuration for API tests"""
    base_url: str
    mode: str
    image_dir: Path
    verbose: bool = False
    llm_only: bool = False  # Only run LLM-calling tests
    grid_test: bool = False  # Enable grid testing with parameter variations


class Colors:
    """ANSI color codes for terminal output"""
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    MAGENTA = '\033[95m'
    CYAN = '\033[96m'
    RESET = '\033[0m'
    BOLD = '\033[1m'


class APITester:
    """Comprehensive API test suite"""

    def __init__(self, config: TestConfig):
        self.config = config
        self.session: Optional[aiohttp.ClientSession] = None
        self.test_results = {
            'passed': 0,
            'failed': 0,
            'skipped': 0,
            'total': 0
        }
        # Store created resources for cleanup
        self.test_user_id: Optional[str] = None
        self.test_artwork_id: Optional[str] = None
        self.test_device_id = f"test-device-{datetime.now().timestamp()}"
        self.using_existing_artwork = False  # Track if we're using existing data

        # Store test data to use consistently across all tests in this run
        self.test_image_path: Optional[Path] = None
        self.test_artwork_info: Optional[dict] = None  # Store artwork details for logging

    async def __aenter__(self):
        """Async context manager entry"""
        self.session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self.session:
            await self.session.close()

    def log_test(self, name: str, status: str, message: str = ""):
        """Log test result with color coding"""
        self.test_results['total'] += 1

        if status == 'PASS':
            self.test_results['passed'] += 1
            print(f"{Colors.GREEN}✓ PASS{Colors.RESET} | {name}")
            if message and self.config.verbose:
                print(f"  → {message}")
        elif status == 'FAIL':
            self.test_results['failed'] += 1
            print(f"{Colors.RED}✗ FAIL{Colors.RESET} | {name}")
            if message:
                print(f"  → {Colors.RED}{message}{Colors.RESET}")
        elif status == 'SKIP':
            self.test_results['skipped'] += 1
            print(f"{Colors.YELLOW}⊘ SKIP{Colors.RESET} | {name}")
            if message:
                print(f"  → {message}")

    def should_skip_non_llm_test(self, test_name: str) -> bool:
        """Check if non-LLM test should be skipped in LLM-only mode"""
        if self.config.llm_only:
            # self.log_test(test_name, "SKIP", "Non-LLM test (use --llm flag)")
            return True
        return False

    def log_llm_response(self, response_text: str):
        """Log LLM response in verbose mode with word wrapping"""
        if not self.config.verbose:
            return

        print(f"{Colors.CYAN}  ╭─ LLM Response ─────────────────────────────────────{Colors.RESET}")

        # Word wrap at 60 characters (show complete response)
        wrapped_lines = textwrap.wrap(response_text, width=60)

        for line in wrapped_lines:
            print(f"{Colors.CYAN}  │ {Colors.RESET}{line}")

        print(f"{Colors.CYAN}  ╰────────────────────────────────────────────────────{Colors.RESET}")

    async def fetch_existing_artwork_id(self) -> Optional[str]:
        """Fetch a random existing artwork ID from the database and store its info"""
        try:
            start_time = time.time()
            async with self.session.get(
                f"{self.config.base_url}/api/artworks?limit=100"
            ) as response:
                latency = time.time() - start_time
                if response.status == 200:
                    data = await response.json()
                    items = data.get('items', [])
                    if items:
                        artwork = random.choice(items)
                        artwork_id = artwork.get('id')
                        # Store artwork info for consistent logging
                        self.test_artwork_info = {
                            'id': artwork_id,
                            'artist_name': artwork.get('artist_name', 'Unknown'),
                            'artwork_name': artwork.get('artwork_name', 'Unknown')
                        }
                        if self.config.verbose:
                            print(f"{Colors.CYAN}Selected artwork: {self.test_artwork_info['artist_name']} - {self.test_artwork_info['artwork_name']} | Latency: {latency:.3f}s{Colors.RESET}")
                        return artwork_id
                return None
        except Exception as e:
            latency = time.time() - start_time if 'start_time' in locals() else 0
            if self.config.verbose:
                print(f"{Colors.YELLOW}Could not fetch existing artworks: {e} | Latency: {latency:.3f}s{Colors.RESET}")
            return None

    def get_random_image(self) -> Optional[Path]:
        """Get a random image from the museum images directory"""
        valid_extensions = {'.jpg', '.jpeg', '.png', '.webp'}

        try:
            images = [
                f for f in self.config.image_dir.rglob('*')
                if f.is_file() and f.suffix.lower() in valid_extensions
            ]

            if not images:
                print(f"{Colors.YELLOW}Warning: No images found in {self.config.image_dir}{Colors.RESET}")
                return None

            selected = random.choice(images)
            if self.config.verbose:
                print(f"{Colors.CYAN}Using image: {selected.name}{Colors.RESET}")
            return selected

        except Exception as e:
            print(f"{Colors.RED}Error accessing images: {e}{Colors.RESET}")
            return None

    async def test_root_endpoint(self):
        """Test GET / endpoint"""
        if self.should_skip_non_llm_test("GET /"):
            return

        try:
            start_time = time.time()
            async with self.session.get(f"{self.config.base_url}/") as response:
                data = await response.json()
                latency = time.time() - start_time
                assert response.status == 200
                assert 'message' in data
                assert 'version' in data
                self.log_test("GET /", "PASS", f"Version: {data.get('version')} | Latency: {latency:.3f}s")
        except Exception as e:
            latency = time.time() - start_time if 'start_time' in locals() else 0
            self.log_test("GET /", "FAIL", f"{str(e)} | Latency: {latency:.3f}s")

    async def test_health_endpoint(self):
        """Test GET /health endpoint"""
        if self.should_skip_non_llm_test("GET /health"):
            return

        try:
            start_time = time.time()
            async with self.session.get(f"{self.config.base_url}/health") as response:
                data = await response.json()
                latency = time.time() - start_time
                assert response.status == 200
                assert data.get('status') == 'healthy'
                self.log_test(
                    "GET /health",
                    "PASS",
                    f"Provider: {data.get('ai_provider')}, DB: {data.get('database_enabled')} | Latency: {latency:.3f}s"
                )
        except Exception as e:
            latency = time.time() - start_time if 'start_time' in locals() else 0
            self.log_test("GET /health", "FAIL", f"{str(e)} | Latency: {latency:.3f}s")

    async def test_get_providers(self):
        """Test GET /api/providers endpoint"""
        if self.should_skip_non_llm_test("GET /api/providers"):
            return

        try:
            start_time = time.time()
            async with self.session.get(f"{self.config.base_url}/api/providers") as response:
                data = await response.json()
                latency = time.time() - start_time
                assert response.status == 200
                assert 'available_providers' in data
                assert isinstance(data['available_providers'], list)
                self.log_test(
                    "GET /api/providers",
                    "PASS",
                    f"Providers: {', '.join(data['available_providers'])} | Latency: {latency:.3f}s"
                )
        except Exception as e:
            latency = time.time() - start_time if 'start_time' in locals() else 0
            self.log_test("GET /api/providers", "FAIL", f"{str(e)} | Latency: {latency:.3f}s")

    async def test_get_identities(self):
        """Test GET /api/identities endpoint"""
        if self.should_skip_non_llm_test("GET /api/identities"):
            return

        try:
            start_time = time.time()
            async with self.session.get(f"{self.config.base_url}/api/identities") as response:
                data = await response.json()
                latency = time.time() - start_time
                assert response.status == 200
                assert 'available_identities' in data
                assert isinstance(data['available_identities'], list)
                self.log_test(
                    "GET /api/identities",
                    "PASS",
                    f"Identities: {len(data['available_identities'])} available | Latency: {latency:.3f}s"
                )
        except Exception as e:
            latency = time.time() - start_time if 'start_time' in locals() else 0
            self.log_test("GET /api/identities", "FAIL", f"{str(e)} | Latency: {latency:.3f}s")

    async def test_artwork_analyze(self, language: str = "english"):
        """Test POST /api/artwork-analyze endpoint"""
        # Use the consistent test image selected at the start
        image_path = self.test_image_path
        test_name = f"POST /api/artwork-analyze [{language}]" if self.config.grid_test else "POST /api/artwork-analyze"

        if not image_path:
            self.log_test(test_name, "SKIP", "No images available")
            return

        try:
            data = aiohttp.FormData()
            data.add_field('image', open(image_path, 'rb'), filename=image_path.name)
            if self.config.grid_test:
                data.add_field('language', language)

            start_time = time.time()
            async with self.session.post(
                f"{self.config.base_url}/api/artwork-analyze",
                data=data
            ) as response:
                result = await response.json()
                latency = time.time() - start_time
                assert response.status == 200
                assert 'analysis' in result
                assert 'model_used' in result

                self.log_test(
                    test_name,
                    "PASS",
                    f"Model: {result.get('model_used')} | Latency: {latency:.3f}s"
                )
                # Print LLM response in verbose mode
                self.log_llm_response(result.get('analysis', ''))
        except Exception as e:
            latency = time.time() - start_time if 'start_time' in locals() else 0
            self.log_test(test_name, "FAIL", f"{str(e)} | Latency: {latency:.3f}s")

    async def test_remove_background(self):
        """Test POST /api/remove-background endpoint"""
        if self.should_skip_non_llm_test("POST /api/remove-background"):
            return

        # Use the consistent test image selected at the start
        image_path = self.test_image_path
        if not image_path:
            self.log_test("POST /api/remove-background", "SKIP", "No images available")
            return

        try:
            data = aiohttp.FormData()
            data.add_field('image', open(image_path, 'rb'), filename=image_path.name)

            start_time = time.time()
            async with self.session.post(
                f"{self.config.base_url}/api/remove-background",
                data=data
            ) as response:
                latency = time.time() - start_time
                # This might fail if PhotoRoom API key is not configured
                if response.status == 200:
                    assert response.content_type == 'image/png'
                    self.log_test("POST /api/remove-background", "PASS", f"Latency: {latency:.3f}s")
                elif response.status == 500:
                    error = await response.json()
                    if "PhotoRoom" in error.get('detail', ''):
                        self.log_test(
                            "POST /api/remove-background",
                            "SKIP",
                            f"PhotoRoom API key not configured | Latency: {latency:.3f}s"
                        )
                    else:
                        raise Exception(error.get('detail'))
                else:
                    raise Exception(f"Unexpected status: {response.status}")
        except Exception as e:
            latency = time.time() - start_time if 'start_time' in locals() else 0
            self.log_test("POST /api/remove-background", "FAIL", f"{str(e)} | Latency: {latency:.3f}s")

    async def test_create_user(self):
        """Test POST /api/users endpoint"""
        if self.should_skip_non_llm_test("POST /api/users"):
            return

        try:
            payload = {
                "device_id": self.test_device_id,
                "username": "test_user",
                "email": "test@example.com"
            }

            start_time = time.time()
            async with self.session.post(
                f"{self.config.base_url}/api/users",
                json=payload
            ) as response:
                data = await response.json()
                latency = time.time() - start_time
                assert response.status == 200
                assert 'user_id' in data
                assert data['device_id'] == self.test_device_id

                # Store for later tests
                self.test_user_id = data['user_id']
                self.log_test(
                    "POST /api/users",
                    "PASS",
                    f"Created user: {self.test_user_id} | Latency: {latency:.3f}s"
                )
        except Exception as e:
            latency = time.time() - start_time if 'start_time' in locals() else 0
            self.log_test("POST /api/users", "FAIL", f"{str(e)} | Latency: {latency:.3f}s")

    async def test_get_user(self):
        """Test GET /api/users/{user_id} endpoint"""
        if self.should_skip_non_llm_test("GET /api/users/{user_id}"):
            return

        if not self.test_user_id:
            self.log_test("GET /api/users/{user_id}", "SKIP", "No test user created")
            return

        try:
            start_time = time.time()
            async with self.session.get(
                f"{self.config.base_url}/api/users/{self.test_user_id}"
            ) as response:
                data = await response.json()
                latency = time.time() - start_time
                assert response.status == 200
                assert data['user_id'] == self.test_user_id
                self.log_test("GET /api/users/{user_id}", "PASS", f"Latency: {latency:.3f}s")
        except Exception as e:
            latency = time.time() - start_time if 'start_time' in locals() else 0
            self.log_test("GET /api/users/{user_id}", "FAIL", f"{str(e)} | Latency: {latency:.3f}s")

    async def test_get_user_by_device(self):
        """Test GET /api/users/by-device/{device_id} endpoint"""
        if self.should_skip_non_llm_test("GET /api/users/by-device/{device_id}"):
            return

        if not self.test_user_id:
            self.log_test("GET /api/users/by-device/{device_id}", "SKIP", "No test user created")
            return

        try:
            start_time = time.time()
            async with self.session.get(
                f"{self.config.base_url}/api/users/by-device/{self.test_device_id}"
            ) as response:
                data = await response.json()
                latency = time.time() - start_time
                assert response.status == 200
                assert data['device_id'] == self.test_device_id
                self.log_test("GET /api/users/by-device/{device_id}", "PASS", f"Latency: {latency:.3f}s")
        except Exception as e:
            latency = time.time() - start_time if 'start_time' in locals() else 0
            self.log_test("GET /api/users/by-device/{device_id}", "FAIL", f"{str(e)} | Latency: {latency:.3f}s")

    async def test_update_user(self):
        """Test PUT /api/users/{user_id} endpoint"""
        if self.should_skip_non_llm_test("PUT /api/users/{user_id}"):
            return

        if not self.test_user_id:
            self.log_test("PUT /api/users/{user_id}", "SKIP", "No test user created")
            return

        try:
            payload = {
                "username": "updated_test_user",
                "email": "updated@example.com"
            }

            start_time = time.time()
            async with self.session.put(
                f"{self.config.base_url}/api/users/{self.test_user_id}",
                json=payload
            ) as response:
                data = await response.json()
                latency = time.time() - start_time
                assert response.status == 200
                assert data['username'] == "updated_test_user"
                self.log_test("PUT /api/users/{user_id}", "PASS", f"Latency: {latency:.3f}s")
        except Exception as e:
            latency = time.time() - start_time if 'start_time' in locals() else 0
            self.log_test("PUT /api/users/{user_id}", "FAIL", f"{str(e)} | Latency: {latency:.3f}s")

    async def test_save_artwork(self):
        """Test POST /api/artworks endpoint"""
        if self.should_skip_non_llm_test("POST /api/artworks"):
            return

        if not self.test_user_id:
            self.log_test("POST /api/artworks", "SKIP", "No test user created")
            return

        try:
            conversation_history = [
                {"role": "assistant", "content": "This is a beautiful artwork!"},
                {"role": "user", "content": "Tell me more"},
                {"role": "assistant", "content": "The colors are vibrant..."}
            ]

            params = {
                "colors": ["#FF5733", "#33FF57", "#3357FF"],
                "source": "test"
            }

            data = aiohttp.FormData()
            data.add_field('photo_uri', 'file:///test/path/image.jpg')
            data.add_field('artist_name', 'Test Artist')
            data.add_field('artwork_name', 'Test Artwork')
            data.add_field('conversation_history', json.dumps(conversation_history))
            data.add_field('user_id', self.test_user_id)
            data.add_field('location', 'Test Museum')
            data.add_field('museum_name', 'Museum of Testing')
            data.add_field('is_recognized', 'true')
            data.add_field('params', json.dumps(params))

            start_time = time.time()
            async with self.session.post(
                f"{self.config.base_url}/api/artworks",
                data=data
            ) as response:
                result = await response.json()
                latency = time.time() - start_time
                assert response.status == 200
                assert 'id' in result

                # Store for later tests
                self.test_artwork_id = result['id']
                self.log_test(
                    "POST /api/artworks",
                    "PASS",
                    f"Saved artwork: {self.test_artwork_id} | Latency: {latency:.3f}s"
                )
        except Exception as e:
            latency = time.time() - start_time if 'start_time' in locals() else 0
            self.log_test("POST /api/artworks", "FAIL", f"{str(e)} | Latency: {latency:.3f}s")

    async def test_get_saved_artworks(self):
        """Test GET /api/artworks endpoint"""
        if self.should_skip_non_llm_test("GET /api/artworks"):
            return

        if not self.test_user_id:
            self.log_test("GET /api/artworks", "SKIP", "No test user created")
            return

        try:
            start_time = time.time()
            async with self.session.get(
                f"{self.config.base_url}/api/artworks?user_id={self.test_user_id}"
            ) as response:
                data = await response.json()
                latency = time.time() - start_time
                assert response.status == 200
                assert 'items' in data
                assert isinstance(data['items'], list)
                self.log_test(
                    "GET /api/artworks",
                    "PASS",
                    f"Found {data['count']} artworks | Latency: {latency:.3f}s"
                )
        except Exception as e:
            latency = time.time() - start_time if 'start_time' in locals() else 0
            self.log_test("GET /api/artworks", "FAIL", f"{str(e)} | Latency: {latency:.3f}s")

    async def test_get_saved_artwork(self):
        """Test GET /api/artworks/{artwork_id} endpoint"""
        if self.should_skip_non_llm_test("GET /api/artworks/{artwork_id}"):
            return

        if not self.test_artwork_id:
            self.log_test("GET /api/artworks/{artwork_id}", "SKIP", "No test artwork created")
            return

        try:
            start_time = time.time()
            async with self.session.get(
                f"{self.config.base_url}/api/artworks/{self.test_artwork_id}"
            ) as response:
                data = await response.json()
                latency = time.time() - start_time
                assert response.status == 200
                assert data['id'] == self.test_artwork_id
                assert 'conversation_history' in data
                self.log_test("GET /api/artworks/{artwork_id}", "PASS", f"Latency: {latency:.3f}s")
        except Exception as e:
            latency = time.time() - start_time if 'start_time' in locals() else 0
            self.log_test("GET /api/artworks/{artwork_id}", "FAIL", f"{str(e)} | Latency: {latency:.3f}s")

    async def test_update_saved_artwork(self):
        """Test PUT /api/artworks/{artwork_id} endpoint"""
        if self.should_skip_non_llm_test("PUT /api/artworks/{artwork_id}"):
            return

        if not self.test_artwork_id:
            self.log_test("PUT /api/artworks/{artwork_id}", "SKIP", "No test artwork created")
            return

        try:
            payload = {
                "artist_name": "Updated Artist",
                "artwork_name": "Updated Artwork",
                "params": {"updated": True}
            }

            start_time = time.time()
            async with self.session.put(
                f"{self.config.base_url}/api/artworks/{self.test_artwork_id}",
                json=payload
            ) as response:
                data = await response.json()
                latency = time.time() - start_time
                assert response.status == 200
                assert data['artist_name'] == "Updated Artist"
                self.log_test("PUT /api/artworks/{artwork_id}", "PASS", f"Latency: {latency:.3f}s")
        except Exception as e:
            latency = time.time() - start_time if 'start_time' in locals() else 0
            self.log_test("PUT /api/artworks/{artwork_id}", "FAIL", f"{str(e)} | Latency: {latency:.3f}s")

    async def test_artwork_chat(self, language: str = "english"):
        """Test POST /api/artwork-chat endpoint (stateless)"""
        image_path = self.test_image_path
        test_name = f"POST /api/artwork-chat [{language}]" if self.config.grid_test else "POST /api/artwork-chat"

        if not image_path:
            self.log_test(test_name, "SKIP", "No images available")
            return

        # Use artwork info from test data or defaults
        artist_name = self.test_artwork_info.get('artist_name', 'Test Artist') if self.test_artwork_info else 'Test Artist'
        artwork_name = self.test_artwork_info.get('artwork_name', 'Test Artwork') if self.test_artwork_info else 'Test Artwork'

        try:
            conversation_history = [
                {"role": "assistant", "content": "This is a beautiful painting."},
                {"role": "user", "content": "What technique did the artist use?"}
            ]

            data = aiohttp.FormData()
            data.add_field('image', open(image_path, 'rb'), filename=image_path.name)
            data.add_field('artist_name', artist_name)
            data.add_field('artwork_name', artwork_name)
            data.add_field('query', 'Tell me about the brushwork technique.')
            data.add_field('conversation_history', json.dumps(conversation_history))
            if self.config.grid_test:
                data.add_field('language', language)

            start_time = time.time()
            async with self.session.post(
                f"{self.config.base_url}/api/artwork-chat",
                data=data
            ) as response:
                result = await response.json()
                latency = time.time() - start_time
                assert response.status == 200
                assert 'response' in result
                assert 'model_used' in result

                self.log_test(
                    test_name,
                    "PASS",
                    f"Got response (model: {result.get('model_used')}) | Latency: {latency:.3f}s"
                )
                # Print LLM response in verbose mode
                self.log_llm_response(result.get('response', ''))
        except Exception as e:
            latency = time.time() - start_time if 'start_time' in locals() else 0
            self.log_test(test_name, "FAIL", f"{str(e)} | Latency: {latency:.3f}s")

    async def test_suggest_topic(self, language: str = "english"):
        """Test POST /api/suggest-topic endpoint (stateless)"""
        test_name = f"POST /api/suggest-topic [{language}]" if self.config.grid_test else "POST /api/suggest-topic"

        # Use artwork info from test data or existing artwork
        artist_name = self.test_artwork_info.get('artist_name', 'Test Artist') if self.test_artwork_info else 'Test Artist'
        artwork_name = self.test_artwork_info.get('artwork_name', 'Test Artwork') if self.test_artwork_info else 'Test Artwork'

        try:
            conversation_history = [
                {"role": "assistant", "content": "This is a beautiful artwork with vibrant colors."},
                {"role": "user", "content": "Tell me more about the technique."},
                {"role": "assistant", "content": "The artist used impasto technique with thick brushstrokes."}
            ]

            data = aiohttp.FormData()
            data.add_field('artist_name', artist_name)
            data.add_field('artwork_name', artwork_name)
            data.add_field('conversation_history', json.dumps(conversation_history))
            if self.config.grid_test:
                data.add_field('language', language)

            start_time = time.time()
            async with self.session.post(
                f"{self.config.base_url}/api/suggest-topic",
                data=data
            ) as response:
                result = await response.json()
                latency = time.time() - start_time
                assert response.status == 200
                assert 'suggested_topics' in result
                assert isinstance(result['suggested_topics'], list)

                topics_str = ', '.join(result['suggested_topics'])
                self.log_test(
                    test_name,
                    "PASS",
                    f"Topics: {', '.join(result['suggested_topics'][:3])} | Latency: {latency:.3f}s"
                )
                # Print full topic list in verbose mode
                if self.config.verbose and len(result['suggested_topics']) > 3:
                    self.log_llm_response(f"All topics: {topics_str}")
        except Exception as e:
            latency = time.time() - start_time if 'start_time' in locals() else 0
            self.log_test(test_name, "FAIL", f"{str(e)} | Latency: {latency:.3f}s")

    async def test_generate_summary(self, language: str = "english"):
        """Test POST /api/generate-summary endpoint (stateless)"""
        image_path = self.test_image_path
        test_name = f"POST /api/generate-summary [{language}]" if self.config.grid_test else "POST /api/generate-summary"

        if not image_path:
            self.log_test(test_name, "SKIP", "No images available")
            return

        # Use artwork info from test data or defaults
        artist_name = self.test_artwork_info.get('artist_name', 'Test Artist') if self.test_artwork_info else 'Test Artist'
        artwork_name = self.test_artwork_info.get('artwork_name', 'Test Artwork') if self.test_artwork_info else 'Test Artwork'

        try:
            conversation_history = [
                {"role": "assistant", "content": "This artwork shows beautiful use of color."},
                {"role": "user", "content": "What makes it special?"},
                {"role": "assistant", "content": "The composition creates a sense of movement."}
            ]

            data = aiohttp.FormData()
            data.add_field('image', open(image_path, 'rb'), filename=image_path.name)
            data.add_field('artist_name', artist_name)
            data.add_field('artwork_name', artwork_name)
            data.add_field('conversation_history', json.dumps(conversation_history))
            if self.config.grid_test:
                data.add_field('language', language)

            start_time = time.time()
            async with self.session.post(
                f"{self.config.base_url}/api/generate-summary",
                data=data
            ) as response:
                result = await response.json()
                latency = time.time() - start_time
                assert response.status == 200
                assert 'summary' in result
                assert 'model_used' in result

                self.log_test(
                    test_name,
                    "PASS",
                    f"Generated summary (model: {result.get('model_used')}) | Latency: {latency:.3f}s"
                )
                # Print LLM response in verbose mode
                self.log_llm_response(result.get('summary', ''))
        except Exception as e:
            latency = time.time() - start_time if 'start_time' in locals() else 0
            self.log_test(test_name, "FAIL", f"{str(e)} | Latency: {latency:.3f}s")

    async def test_delete_saved_artwork(self):
        """Test DELETE /api/artworks/{artwork_id} endpoint"""
        if self.should_skip_non_llm_test("DELETE /api/artworks/{artwork_id}"):
            return

        if not self.test_artwork_id:
            self.log_test("DELETE /api/artworks/{artwork_id}", "SKIP", "No test artwork created")
            return

        # Don't delete if we're using an existing artwork from the database
        if self.using_existing_artwork:
            self.log_test("DELETE /api/artworks/{artwork_id}", "SKIP", "Using existing artwork (not deleting)")
            return

        try:
            start_time = time.time()
            async with self.session.delete(
                f"{self.config.base_url}/api/artworks/{self.test_artwork_id}"
            ) as response:
                data = await response.json()
                latency = time.time() - start_time
                assert response.status == 200
                assert 'message' in data
                self.log_test("DELETE /api/artworks/{artwork_id}", "PASS", f"Latency: {latency:.3f}s")
                # Clear the ID so we don't try to use it again
                self.test_artwork_id = None
        except Exception as e:
            latency = time.time() - start_time if 'start_time' in locals() else 0
            self.log_test("DELETE /api/artworks/{artwork_id}", "FAIL", f"{str(e)} | Latency: {latency:.3f}s")

    async def test_delete_user(self):
        """Test DELETE /api/users/{user_id} endpoint"""
        if self.should_skip_non_llm_test("DELETE /api/users/{user_id}"):
            return

        if not self.test_user_id:
            self.log_test("DELETE /api/users/{user_id}", "SKIP", "No test user created")
            return

        try:
            start_time = time.time()
            async with self.session.delete(
                f"{self.config.base_url}/api/users/{self.test_user_id}"
            ) as response:
                data = await response.json()
                latency = time.time() - start_time
                assert response.status == 200
                assert 'message' in data
                self.log_test("DELETE /api/users/{user_id}", "PASS", f"Latency: {latency:.3f}s")
                # Clear the ID so we don't try to use it again
                self.test_user_id = None
        except Exception as e:
            latency = time.time() - start_time if 'start_time' in locals() else 0
            self.log_test("DELETE /api/users/{user_id}", "FAIL", f"{str(e)} | Latency: {latency:.3f}s")

    async def run_all_tests(self):
        """Run all API tests in sequence"""
        print(f"\n{Colors.BOLD}{'='*70}{Colors.RESET}")
        print(f"{Colors.BOLD}Musee API Test Suite{Colors.RESET}")
        if self.config.llm_only:
            print(f"{Colors.BOLD}{Colors.MAGENTA}[LLM Tests Only]{Colors.RESET}")
        if self.config.grid_test:
            print(f"{Colors.BOLD}{Colors.BLUE}[Grid Test Mode: Testing with multiple parameters]{Colors.RESET}")
        print(f"{Colors.BOLD}{'='*70}{Colors.RESET}")
        print(f"Mode: {Colors.CYAN}{self.config.mode.upper()}{Colors.RESET}")
        print(f"Base URL: {Colors.CYAN}{self.config.base_url}{Colors.RESET}")
        print(f"Image Directory: {Colors.CYAN}{self.config.image_dir}{Colors.RESET}")
        if self.config.llm_only:
            print(f"Test Filter: {Colors.MAGENTA}LLM-calling endpoints only{Colors.RESET}")
        if self.config.grid_test:
            print(f"Grid Parameters: {Colors.BLUE}language=[english, chinese]{Colors.RESET}")
        print(f"{Colors.BOLD}{'-'*70}{Colors.RESET}\n")

        # Select test image once for ALL tests in this run (consistency)
        print(f"{Colors.CYAN}Selecting test image for this run...{Colors.RESET}")
        self.test_image_path = self.get_random_image()
        if self.test_image_path:
            print(f"{Colors.GREEN}✓ Using image: {self.test_image_path.name}{Colors.RESET}")
        else:
            print(f"{Colors.YELLOW}⚠ No images found - image-based tests will be skipped{Colors.RESET}")

        # In LLM-only mode, try to fetch an existing artwork ID for tests
        if self.config.llm_only:
            print(f"{Colors.CYAN}Fetching existing artwork for LLM tests...{Colors.RESET}")
            artwork_id = await self.fetch_existing_artwork_id()
            if artwork_id:
                self.test_artwork_id = artwork_id
                self.using_existing_artwork = True
                print(f"{Colors.GREEN}✓ Using existing artwork (ID: {artwork_id[:8]}...){Colors.RESET}")
            else:
                print(f"{Colors.YELLOW}⚠ No existing artworks found - some tests may be skipped{Colors.RESET}")

        print()  # Blank line before tests start

        # Grid test parameters
        grid_languages = ["english", "chinese"] if self.config.grid_test else [None]

        # Test order matters - create resources before testing operations on them
        test_sequence = [
            # Basic endpoints
            ("Root Endpoint", self.test_root_endpoint, False),
            ("Health Check", self.test_health_endpoint, False),
            ("Get Providers", self.test_get_providers, False),
            ("Get Identities", self.test_get_identities, False),

            # User endpoints (create first)
            ("Create User", self.test_create_user, False),
            ("Get User", self.test_get_user, False),
            ("Get User by Device", self.test_get_user_by_device, False),
            ("Update User", self.test_update_user, False),

            # Artwork analysis endpoints (LLM)
            ("Artwork Analyze", self.test_artwork_analyze, True),
            ("Remove Background", self.test_remove_background, False),

            # Saved artworks (create before operating)
            ("Save Artwork", self.test_save_artwork, False),
            ("Get Saved Artworks", self.test_get_saved_artworks, False),
            ("Get Saved Artwork", self.test_get_saved_artwork, False),
            ("Update Saved Artwork", self.test_update_saved_artwork, False),
            ("Artwork Chat", self.test_artwork_chat, True),
            ("Suggest Topic", self.test_suggest_topic, True),
            ("Generate Summary", self.test_generate_summary, True),

            # Cleanup (delete last)
            ("Delete Saved Artwork", self.test_delete_saved_artwork, False),
            ("Delete User", self.test_delete_user, False),
        ]

        for section_name, test_func, is_llm_test in test_sequence:
            try:
                # Run grid tests for LLM endpoints if grid_test is enabled
                if is_llm_test and self.config.grid_test:
                    for language in grid_languages:
                        await test_func(language=language)
                else:
                    # Regular test (no language parameter)
                    await test_func()
            except Exception as e:
                print(f"{Colors.RED}Unexpected error in {section_name}: {e}{Colors.RESET}")

        # Print summary
        print(f"\n{Colors.BOLD}{'-'*70}{Colors.RESET}")
        print(f"{Colors.BOLD}Test Summary{Colors.RESET}")
        print(f"{Colors.BOLD}{'-'*70}{Colors.RESET}")
        print(f"Total:   {self.test_results['total']}")
        print(f"{Colors.GREEN}Passed:  {self.test_results['passed']}{Colors.RESET}")
        print(f"{Colors.RED}Failed:  {self.test_results['failed']}{Colors.RESET}")
        print(f"{Colors.YELLOW}Skipped: {self.test_results['skipped']}{Colors.RESET}")

        success_rate = (
            (self.test_results['passed'] / self.test_results['total'] * 100)
            if self.test_results['total'] > 0 else 0
        )
        print(f"\nSuccess Rate: {Colors.GREEN if success_rate >= 80 else Colors.YELLOW}{success_rate:.1f}%{Colors.RESET}")
        print(f"{Colors.BOLD}{'='*70}{Colors.RESET}\n")

        # Return exit code based on failures
        return 0 if self.test_results['failed'] == 0 else 1


def parse_args():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(
        description='Comprehensive API test suite for Musee backend',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Test development server
  python test_api.py --mode dev

  # Test production server
  python test_api.py --mode prod

  # Test custom URL with verbose output
  python test_api.py --mode prod --url https://my-api.vercel.app --verbose

  # Only test LLM endpoints (faster, avoids rate limits)
  python test_api.py --mode dev --llm --verbose

  # Run grid tests (LLM endpoints with language variations)
  python test_api.py --mode dev --grid --verbose

  # Combine grid testing with LLM-only mode
  python test_api.py --mode dev --llm --grid --verbose

  # Use custom image directory
  python test_api.py --mode dev --images ~/Desktop/art_photos
        """
    )

    parser.add_argument(
        '--mode',
        choices=['dev', 'prod'],
        required=True,
        help='Test mode: dev (localhost) or prod (Vercel)'
    )

    parser.add_argument(
        '--url',
        type=str,
        help='Custom base URL (overrides default for mode)'
    )

    parser.add_argument(
        '--images',
        type=str,
        default='testing/images',
        help='Directory containing test images (default: testing/images)'
    )

    parser.add_argument(
        '--verbose',
        '-v',
        action='store_true',
        help='Enable verbose output'
    )

    parser.add_argument(
        '--llm',
        action='store_true',
        help='Only run LLM-calling tests (artwork-analyze, artwork-chat, suggest-topic, generate-summary)'
    )

    parser.add_argument(
        '--grid',
        action='store_true',
        help='Enable grid testing (run LLM tests with parameter variations: language=english,chinese)'
    )

    return parser.parse_args()


async def main():
    """Main entry point"""
    args = parse_args()

    # Determine base URL
    if args.url:
        base_url = args.url.rstrip('/')
    elif args.mode == 'dev':
        base_url = 'http://localhost:8000'
    else:  # prod
        # Default Vercel URL - user should override with --url
        base_url = 'https://your-app.vercel.app'
        print(f"{Colors.YELLOW}Warning: Using default Vercel URL. Use --url to specify your actual deployment URL.{Colors.RESET}\n")

    # Expand image directory path
    image_dir = Path(args.images).expanduser()
    if not image_dir.exists():
        print(f"{Colors.RED}Error: Image directory not found: {image_dir}{Colors.RESET}")
        print(f"{Colors.YELLOW}Hint: Create the directory or use --images to specify a different path{Colors.RESET}")
        return 1

    # Create test configuration
    config = TestConfig(
        base_url=base_url,
        mode=args.mode,
        image_dir=image_dir,
        verbose=args.verbose,
        llm_only=args.llm,
        grid_test=args.grid
    )

    # Run tests
    async with APITester(config) as tester:
        exit_code = await tester.run_all_tests()

    return exit_code


if __name__ == '__main__':
    try:
        exit_code = asyncio.run(main())
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print(f"\n{Colors.YELLOW}Tests interrupted by user{Colors.RESET}")
        sys.exit(130)
    except Exception as e:
        print(f"\n{Colors.RED}Fatal error: {e}{Colors.RESET}")
        sys.exit(1)
