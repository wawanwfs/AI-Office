"""Reviewed disposable loopback ingress: fixed TCP bridge to api:8000.

Trusted ingress runs as nonroot with a readonly filesystem. The application
API and PostgreSQL join ONLY internal Docker networks. Stream forwarding
preserves HTTP, WebSocket upgrades and SSE without trusting Host or URL.
Not a public TLS reverse proxy, and not ready for untrusted source code.
"""
import asyncio
from contextlib import suppress

CONNECTIONS = asyncio.Semaphore(64)


async def pump(source, destination):
    while True:
        data = await source.read(65536)
        if not data:
            with suppress(OSError, RuntimeError):
                destination.write_eof()
            return
        destination.write(data)
        await destination.drain()


async def handle(client_reader, client_writer):
    upstream_writer = None
    async with CONNECTIONS:
        try:
            upstream_reader, upstream_writer = await asyncio.wait_for(
                asyncio.open_connection("api", 8000), timeout=5
            )
            await asyncio.wait_for(
                asyncio.gather(
                    pump(client_reader, upstream_writer),
                    pump(upstream_reader, client_writer),
                ), timeout=300
            )
        except (OSError, TimeoutError, asyncio.TimeoutError, ConnectionError):
            pass
        finally:
            for writer in (upstream_writer, client_writer):
                if writer is not None:
                    writer.close()
                    with suppress(OSError, TimeoutError):
                        await asyncio.wait_for(writer.wait_closed(), timeout=2)


async def main():
    server = await asyncio.start_server(
        handle, "0.0.0.0", 8000, backlog=128, limit=65536
    )
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
