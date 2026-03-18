#!/usr/bin/env python

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
import math

from PIL import Image

class Utils:
	
	@staticmethod
	def randomString():
		return uuid.uuid4().hex.upper()[0:6]

	def getChildTiles(x, y, z):
		childX = x * 2
		childY = y * 2
		childZ = z + 1

		return [
			(childX, childY, childZ),
			(childX+1, childY, childZ),
			(childX+1, childY+1, childZ),
			(childX, childY+1, childZ),
		]

	def makeQuadKey(tile_x, tile_y, level):
		quadkey = ""
		for i in range(level):
			bit = level - i
			digit = ord('0')
			mask = 1 << (bit - 1)
			if (tile_x & mask) != 0:
				digit += 1
			if (tile_y & mask) != 0:
				digit += 2
			quadkey += chr(digit)
		return quadkey

	@staticmethod
	def num2deg(xtile, ytile, zoom):
		n = 2.0 ** zoom
		lon_deg = xtile / n * 360.0 - 180.0
		lat_rad = math.atan(math.sinh(math.pi * (1 - 2 * ytile / n)))
		lat_deg = math.degrees(lat_rad)
		return (lat_deg, lon_deg)

	@staticmethod
	def qualifyURL(url, x, y, z):

		scale22 = 23 - (z * 2)

		# Pick a random subdomain for providers that use {s} (e.g. OSM, Stadia)
		subdomains = ["a", "b", "c"]
		subdomain = random.choice(subdomains)

		replaceMap = {
			"x": str(x),
			"y": str(y),
			"z": str(z),
			"s": subdomain,
			"scale:22": str(scale22),
			"quad": Utils.makeQuadKey(x, y, z),
		}

		for key, value in replaceMap.items():
			newKey = str("{" + str(key) + "}")
			url = url.replace(newKey, value)

		return url

	@staticmethod
	def mergeQuadTile(quadTiles):

		width = 0
		height = 0

		for tile in quadTiles:
			if(tile is not None):
				width = quadTiles[0].size[0] * 2
				height = quadTiles[1].size[1] * 2
				break

		if width == 0 or height == 0:
			return None

		canvas = Image.new('RGB', (width, height))

		if quadTiles[0] is not None:
			canvas.paste(quadTiles[0], box=(0,0))

		if quadTiles[1] is not None:
			canvas.paste(quadTiles[1], box=(width - quadTiles[1].size[0], 0))

		if quadTiles[2] is not None:
			canvas.paste(quadTiles[2], box=(width - quadTiles[2].size[0], height - quadTiles[2].size[1]))

		if quadTiles[3] is not None:
			canvas.paste(quadTiles[3], box=(0, height - quadTiles[3].size[1]))

		return canvas

	@staticmethod
	def downloadFile(url, destination, x, y, z):

		url = Utils.qualifyURL(url, x, y, z)

		code = 0

		# monkey patching SSL certificate issue
		ssl._create_default_https_context = ssl._create_unverified_context

		# Add a browser-like User-Agent so tile servers don't block the request
		headers = {
			"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			"Accept": "image/png,image/*,*/*;q=0.8",
			"Accept-Language": "en-US,en;q=0.9",
			"Referer": "https://www.openstreetmap.org/",
		}

		try:
			req = urllib.request.Request(url, headers=headers)
			with urllib.request.urlopen(req) as response:
				with open(destination, "wb") as out_file:
					out_file.write(response.read())
			code = 200
		except urllib.error.URLError as e:
			if not hasattr(e, "code"):
				print(e)
				code = -1
			else:
				code = e.code

		return code


	@staticmethod
	def downloadFileScaled(url, destination, x, y, z, outputScale):

		if outputScale == 1:
			return Utils.downloadFile(url, destination, x, y, z)

		elif outputScale == 2:

			childTiles = Utils.getChildTiles(x, y, z)
			childImages = []

			for childX, childY, childZ in childTiles:
				
				tempFile = Utils.randomString() + ".png"
				tempFilePath = os.path.join("temp", tempFile)

				code = Utils.downloadFile(url, tempFilePath, childX, childY, childZ)

				if code == 200:
					image = Image.open(tempFilePath)
				else:
					return code

				childImages.append(image)
			
			canvas = Utils.mergeQuadTile(childImages)
			canvas.save(destination, "PNG")
			
			return 200
		