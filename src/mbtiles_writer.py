import sqlite3
import os
from os import listdir
from os.path import isfile, join
import multiprocessing
from PIL import Image
import io
from utils import Utils

class MbtilesWriter:
	
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

		MbtilesWriter.ensureDirectory(lock, path)

		connection = sqlite3.connect(file, check_same_thread=False)
		c = connection.cursor()
		c.execute("CREATE TABLE IF NOT EXISTS metadata (name text, value text);")
		c.execute("CREATE TABLE IF NOT EXISTS tiles (zoom_level integer, tile_column integer, tile_row integer, tile_data blob);")
		
		try:
			c.execute("CREATE UNIQUE INDEX tile_index on tiles (zoom_level, tile_column, tile_row);")
		except:
			pass

		try:
			c.execute("CREATE UNIQUE INDEX metadata_name ON metadata (name);")
		except:
			pass
		
		connection.commit()
		
		try:
			c.executemany("INSERT INTO metadata (name, value) VALUES (?, ?);", [
				("name", name),
				("description", description),
				("format", format), 
				("bounds", ','.join(map(str, bounds))), 
				("center", ','.join(map(str, center))), 
				("minzoom", minZoom), 
				("maxzoom", maxZoom), 
				("profile", profile), 
				("tilesize", str(tileSize)), 
				("scheme", "tms"), 
				("generator", "Map Tiles Downloader via AliFlux"),
				("type", "overlay"),
				("attribution", "Map Tiles Downloader via AliFlux"),
			])

			connection.commit()
		except:
			pass

		

	@staticmethod
	def addTile(lock, filePath, sourcePath, x, y, z, outputScale):

		fileDirectory = os.path.dirname(filePath)
		MbtilesWriter.ensureDirectory(lock, fileDirectory)

		invertedY = (2 ** z) - y - 1

		tileData = []
		with open(sourcePath, "rb") as readFile:
			tileData = readFile.read()
		
		lock.acquire()
		try:

			connection = sqlite3.connect(filePath, check_same_thread=False)
			c = connection.cursor()
			c.execute("INSERT INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (?, ?, ?, ?);", [
				z, x, invertedY, tileData
			])

			connection.commit()

		finally:
			lock.release()


		return

	@staticmethod
	def exists(filePath, x, y, z):
		invertedY = (2 ** z) - y - 1

		if(os.path.exists(filePath)):
			
			connection = sqlite3.connect(filePath, check_same_thread=False)
			c = connection.cursor()

			c.execute("SELECT COUNT(*) FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ? LIMIT 1", (z, x, invertedY))

			result = c.fetchone()

			if result[0] > 0:
				return True

		return False


	@staticmethod
	def close(lock, path, file, minZoom, maxZoom):

		connection = sqlite3.connect(file, check_same_thread=False)
		c = connection.cursor()

		c.execute("SELECT min(tile_row), max(tile_row), min(tile_column), max(tile_column) from tiles WHERE zoom_level = ?", [maxZoom])

		minY, maxY, minX, maxX = c.fetchone()
		minY = (2 ** maxZoom) - minY - 1
		maxY = (2 ** maxZoom) - maxY - 1

		minLat, minLon = Utils.num2deg(minX, minY, maxZoom)
		maxLat, maxLon = Utils.num2deg(maxX+1, maxY+1, maxZoom)

		bounds = [minLon, minLat, maxLon, maxLat]
		boundsString = ','.join(map(str, bounds))

		center = [(minLon + maxLon)/2, (minLat + maxLat)/2, maxZoom]
		centerString = ','.join(map(str, center))
	
		c.execute("UPDATE metadata SET value = ? WHERE name = 'bounds'", [boundsString])
		c.execute("UPDATE metadata SET value = ? WHERE name = 'center'", [centerString])

		connection.commit()

