#!/usr/bin/env python

from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
import threading

from urllib.parse import urlparse
from urllib.parse import parse_qs
from urllib.parse import parse_qsl
import urllib.request
import cgi
import uuid
import random
import string
from cgi import parse_header, parse_multipart
import argparse
import uuid
import random
import time
import json
import shutil
import ssl
import glob
import os
import base64

lock = threading.Lock()

class serverHandler(BaseHTTPRequestHandler):
		
	def ensureDirectory(self, directory):

		thisPath = os.path.join('output', directory)

		lock.acquire()
		try:

			if not os.path.exists('temp'):
				os.makedirs('temp')

			if not os.path.exists('output'):
				os.makedirs('output')


			if not os.path.exists(thisPath):
				os.makedirs(thisPath)

		finally:
			lock.release()

		return thisPath

	def randomString(self):
		return uuid.uuid4().hex.upper()[0:6]

	def downloadFile(self, url, destination):

		code = 0

		# monkey patching SSL certificate issue
		# DONT use it in a prod/sensitive environment
		ssl._create_default_https_context = ssl._create_unverified_context

		try:
			path, response = urllib.request.urlretrieve(url, destination)
			code = 200
		except urllib.error.URLError as e:
			if not hasattr(e, "code"):
				print(e)
				code = -1
			else:
				code = e.code

		return code
		

	def do_POST(self):

		ctype, pdict = parse_header(self.headers['content-type'])
		pdict['boundary'] = bytes(pdict['boundary'].encode('ascii'))
		postvars = parse_multipart(self.rfile, pdict)

		parts = urlparse(self.path)
		if parts.path == '/download-tile':

			x = int(postvars['x'][0])
			y = int(postvars['y'][0])
			z = int(postvars['z'][0])
			quad = str(postvars['quad'][0].decode("utf-8"))
			timestamp = int(postvars['timestamp'][0])
			outputDirectory = str(postvars['outputDirectory'][0].decode("utf-8"))
			outputFile = str(postvars['outputFile'][0].decode("utf-8"))
			source = str(postvars['source'][0].decode("utf-8"))

			replaceMap = {
				"x": str(x),
				"y": str(y),
				"z": str(z),
				"quad": quad,
				"timestamp": str(timestamp),
			}

			for key, value in replaceMap.items():
				newKey = str("{" + str(key) + "}")
				outputDirectory = outputDirectory.replace(newKey, value)
				outputFile = outputFile.replace(newKey, value)
				source = source.replace(newKey, value)

			result = {}

			thisPath = self.ensureDirectory(outputDirectory);
			filePath = os.path.join(thisPath, outputFile)

			print("\n")

			if os.path.isfile(filePath):
				result["code"] = 200
				result["message"] = 'Tile already exists'

				print("EXISTS: " + filePath)

			else:
				tempFile = self.randomString() + ".png"
				tempFilePath = os.path.join("temp", tempFile)

				result["code"] = self.downloadFile(source, tempFilePath)

				print("HIT: " + source + "\n" + "RETURN: " + str(result["code"]))

				if os.path.isfile(tempFilePath):
					shutil.copyfile(tempFilePath, filePath)
					os.remove(tempFilePath)

					result["message"] = 'Tile Downloaded'
					print("SAVE: " + filePath)

				else:
					result["message"] = 'Download failed'


			if os.path.isfile(filePath):
				with open(filePath, "rb") as image_file:
					result["image"] = base64.b64encode(image_file.read()).decode("utf-8")


			self.send_response(200)
			self.send_header("Access-Control-Allow-Origin", "*")
			self.send_header("Content-Type", "application/json")
			self.end_headers()
			self.wfile.write(json.dumps(result).encode('utf-8'))
			return
		
class serverThreadedHandler(ThreadingMixIn, HTTPServer):
	"""Handle requests in a separate thread."""

def run():
	print('Starting Server...')
	server_address = ('', 11291)
	httpd = serverThreadedHandler(server_address, serverHandler)
	print('Running Server...')

	os.startfile('UI\\index.htm', 'open')
	print("Open UI\\index.htm to view the application.")

	httpd.serve_forever()
 
run()
