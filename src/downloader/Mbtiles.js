const fs = require('fs');
var path = require('path');

var sqlite = require('sqlite');
var sqlite3 = require('sqlite3');
var {Mutex} = require("async-mutex");
const { resourceLimits } = require('worker_threads');
const Geo = require('../Utils/GeoCJS.js')

module.exports = class Mbtiles {
    outputPath = "";

    constructor(outputPath, options) {
        this.outputPath = outputPath;
        this.tileQueue = [];
        this.mutex = new Mutex();
        
        
        return (async () => {

            console.log(outputPath);

            this.db = await sqlite.open({
                filename: outputPath,
                driver: sqlite3.Database,
                // mode: sqlite3.OPEN_READONLY
            })

            try {
                await this.db.run("CREATE TABLE IF NOT EXISTS metadata (name text, value text);")
                await this.db.run("CREATE TABLE IF NOT EXISTS tiles (zoom_level integer, tile_column integer, tile_row integer, tile_data blob);")
                await this.db.run("CREATE UNIQUE INDEX IF NOT EXISTS tile_index on tiles (zoom_level, tile_column, tile_row);")
                await this.db.run("CREATE UNIQUE INDEX IF NOT EXISTS metadata_name ON metadata (name);")
            } catch(e) {
                //...
            }

            var format = options.format;

            if(format == "jpeg") {
                format = "jpg"; // Global Mapper cant recognize jpeg :/
            }

            var metadata = {
                "name": "Downloaded Map Tiles",
                "description": "Batch Map Tiles Downloaded via MapTilesDownloader",
                "format": format,
                "bounds": options.bounds.join(","),
                "center": options.center.join(","),
                "minzoom": options.minZoom,
                "maxzoom": options.maxZoom,
                "tilesize": options.tileSize,
                "profile": "mercator",
                "scheme": "tms",
                "generator": "Map Tiles Downloader github.com/AliFlux/MapTilesDownloader",
                "type": "overlay",
                "attribution": options.attribution,
            };

            for(var key in metadata) {
                var value = metadata[key];
                await this.db.run('INSERT OR REPLACE INTO metadata (name, value) VALUES(?, ?)', [key, value])
            }

            return this;
        })();

    }

    invertY(y, z) {
        // TODO check tms scheme
        return Math.pow(2, z) - y - 1
    }

    async listAll() {
        
        var result = [];
        const mappingData = await this.db.all('SELECT zoom_level, tile_column, tile_row FROM tiles')

        for(var row of mappingData) {
            var tile = {
                x: row.tile_column,
                y: this.invertY(row.tile_row, row.zoom_level),
                z: row.zoom_level,
            };

            tile.id = tile.x + "," + tile.y + "," + tile.z;
            result.push(tile);
        }

        return result;
    }

    addTileDelayed(tileBox, buffer) {
        this.tileQueue.push({
            tileBox: tileBox,
            buffer: buffer,
        })
        this.tryFlushTileQueue();
        
    }

    async tryFlushTileQueue() {
        if(this.tileQueue.length % 1000 == 0) {
            await this.flushTileQueue();
        }
    }

    
    async flushTileQueue() {
        const release = await this.mutex.acquire();

        try {

            if(this.tileQueue.length == 0) {
                return;
            }
    
            var tilesToPush = this.tileQueue;
            this.tileQueue = [];
    
            await this.db.run("begin transaction");
        
            for (var {tileBox, buffer} of tilesToPush) {
                await this.db.run("INSERT OR REPLACE INTO tiles (zoom_level, tile_column, tile_row, tile_data) values (?, ?, ?, ?)", tileBox.z, tileBox.x, this.invertY(tileBox.y, tileBox.z), buffer);
            }

        } finally {
            try {
                await this.db.run("commit");
            } catch { }

            release();
        }
    }

    async calculateMetadata() {
        await this.flushTileQueue();

        var { minZoom, maxZoom } = await this.db.get('SELECT min(zoom_level) as minZoom, max(zoom_level) as maxZoom from tiles');

        // minZoom ensures global view in most GIS software
        const coverageZoom = maxZoom;

        var { minX, maxX, minY, maxY } = await this.db.get('SELECT min(tile_row) as minY, max(tile_row) as maxY, min(tile_column) as minX, max(tile_column) as maxX from tiles WHERE zoom_level = ?', [coverageZoom]);

        minY = this.invertY(minY, coverageZoom);
        maxY = this.invertY(maxY, coverageZoom);

		var minLat = Geo.tile2lat(minY, coverageZoom)
		var maxLat = Geo.tile2lat(maxY+1, coverageZoom)

		var minLon = Geo.tile2long(minX, coverageZoom)
		var maxLon = Geo.tile2long(maxX+1, coverageZoom)

		var bounds = [minLon, minLat, maxLon, maxLat]
		var boundsString = bounds.join(",")

		var center = [(minLon + maxLon)/2, (minLat + maxLat)/2]
		var centerString = center.join(",")

        
		await this.db.run("UPDATE metadata SET value = ? WHERE name = 'bounds'", [boundsString])
		await this.db.run("UPDATE metadata SET value = ? WHERE name = 'center'", [centerString])

		await this.db.run("UPDATE metadata SET value = ? WHERE name = 'minzoom'", [minZoom])
		await this.db.run("UPDATE metadata SET value = ? WHERE name = 'maxzoom'", [maxZoom])

    }

    async close() {
        await this.flushTileQueue();
        await this.db.close();
    }

}