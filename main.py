# This is a dummy file to satisfy the App Engine Python runtime builder for our static site
def app(environ, start_response):
    start_response('200 OK', [('Content-Type', 'text/plain')])
    return b'Static site fallback'
