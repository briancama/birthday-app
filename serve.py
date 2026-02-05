#!/usr/bin/env python3
"""
Simple HTTP server that serves .html files for clean URLs
Usage: python3 serve.py [port]
"""
import http.server
import socketserver
import os
import sys
from urllib.parse import unquote

class CleanURLHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Get the requested path
        path = unquote(self.path)
        
        # Remove query parameters
        if '?' in path:
            path = path.split('?')[0]
        
        # If path ends with /, serve index.html
        if path.endswith('/'):
            path += 'index.html'
        elif path == '':
            path = '/index.html'
        
        # If no extension and file doesn't exist, try adding .html
        if '.' not in os.path.basename(path):
            html_path = path + '.html'
            if os.path.exists('.' + html_path) and not os.path.exists('.' + path):
                path = html_path
        
        # Update the path for the parent handler
        self.path = path
        
        # Let the parent handler do the actual serving
        return super().do_GET()

if __name__ == "__main__":
    PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    
    # Allow reusing the address immediately after stopping
    socketserver.TCPServer.allow_reuse_address = True
    
    with socketserver.TCPServer(("", PORT), CleanURLHandler) as httpd:
        print(f"Serving at http://localhost:{PORT}")
        print("Clean URLs enabled - /dashboard serves dashboard.html")
        print("Press Ctrl+C to stop")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")
            httpd.shutdown()