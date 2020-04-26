import sqlite3
import os
import multiprocessing
import io
import json
import shutil

class FileWriter:

	slicer = None
	
	def ensureDirectory(lock, directory):

		lock.acquire()
		try:

			if not os.path.exists('temp'):
				os.makedirs('temp')

			if not os.path.exists('output'):
				os.makedirs('output')

			os.makedirs(directory, exist_ok=True)

		finally:
			lock.release()

		return directory

	@staticmethod
	def addMetadata(lock, path, file, name, description, format, bounds, center, minZoom, maxZoom, profile="mercator", tileSize=256):

		FileWriter.ensureDirectory(lock, path)

		data = [
			("name", name),
			("description", description),
			("format", format), 
			("bounds", ','.join(map(str, bounds))), 
			("center", ','.join(map(str, center))), 
			("minzoom", minZoom), 
			("maxzoom", maxZoom), 
			("profile", profile), 
			("tilesize", str(tileSize)), 
			("scheme", "xyz"), 
			("generator", "EliteMapper by Visor Dynamics"),
			("type", "overlay"),
			("attribution", "EliteMapper by Visor Dynamics"),
		]
		
		with open(path + "/metadata.json", 'w+') as jsonFile:
			json.dump(dict(data), jsonFile)

		return

	@staticmethod
	def addTile(lock, filePath, sourcePath, x, y, z, outputScale):

		fileDirectory = os.path.dirname(filePath)
		FileWriter.ensureDirectory(lock, fileDirectory)
		
		shutil.copyfile(sourcePath, filePath)

		return

	@staticmethod
	def exists(filePath, x, y, z):
		return os.path.isfile(filePath)


	@staticmethod
	def close(lock, path, file, minZoom, maxZoom):
		#TODO recalculate bounds and center
		return