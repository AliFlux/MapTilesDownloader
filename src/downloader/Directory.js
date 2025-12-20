const fs = require('fs');
var path = require('path');
var glob = require('glob-promise');
const Geo = require('../Utils/GeoCJS.js')

module.exports = class Directory {
    outputPath = "";

    constructor(outputPath, options) {
        this.outputPath = outputPath;
        
		var data = {
			"name": "Downloaded Map Tiles",
			"description": "Batch Map Tiles Downloaded via MapTilesDownloader",
			"format": options.format,
			"bounds": options.bounds.join(","),
			"center": options.center.join(","),
			"minzoom": options.minZoom,
			"maxzoom": options.maxZoom,
			"tilesize": options.tileSize,
			"profile": "mercator",
			"scheme": "xyz",
			"generator": "Map Tiles Downloader github.com/AliFlux/MapTilesDownloader",
			"type": "overlay",
			"attribution": options.attribution,
        };

        var metadataPath = outputPath.split("{")[0] + "metadata.json";
		
        return (async () => {
            await fs.promises.mkdir(path.dirname(metadataPath), { recursive: true })
            await fs.promises.writeFile(metadataPath, JSON.stringify(data));

            return this;
        })();
    }

    escapeRegex(string) {
        return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    }

    async listAll() {
        var result = [];

        var pattern = this.outputPath
            .replace("{x}", "*")
            .replace("{y}", "*")
            .replace("{z}", "*");
        
        var regexPattern = this.escapeRegex(this.outputPath)
            .replace("\\{x\\}", "(?<x>[0-9]+)")
            .replace("\\{y\\}", "(?<y>[0-9]+)")
            .replace("\\{z\\}", "(?<z>[0-9]+)");

        var existingFiles = await glob(pattern);
        var regex = new RegExp("^" + regexPattern + "$", "i");

        for(var file of existingFiles) {
            var { groups: { x, y, z } } = regex.exec(file)

            result.push({
                x: parseInt(x),
                y: parseInt(y),
                z: parseInt(z),
                id: x + "," + y + "," + z,
            })
        }

        return result;
    }

    addTileDelayed(tileBox, buffer) {
        var tilePath = this.outputPath
            .replace("{x}", tileBox.x)
            .replace("{y}", tileBox.y)
            .replace("{z}", tileBox.z);
    
        (async () => {
            await fs.promises.mkdir(path.dirname(tilePath), { recursive: true })
            fs.promises.writeFile(tilePath, buffer); // async
        })();
        
    }

    
    async flushTileQueue() {

    }

    async calculateMetadata() {
        await this.flushTileQueue();
        
        // get maxZoom
        // get minX, maxX, minY, maxY from allTiles of maxZoom
        // convert to bounds and center
        // update metadata
        
        var allTiles = await this.listAll();
        var allZoomLevels = allTiles.map(t => t.z);

        const maxZoom = Math.max(...allZoomLevels, 0);
        const minZoom = Math.min(...allZoomLevels, 30);

        // minZoom ensures global view in most GIS software
        const coverageZoom = maxZoom;

        var filteredTiles = allTiles.filter(t => t.z == coverageZoom);

        const xs = filteredTiles.map(t => t.x);
        const ys = filteredTiles.map(t => t.y);

        const maxX = Math.max(...xs);
        const maxY = Math.max(...ys);

        const minX = Math.min(...xs);
        const minY = Math.min(...ys);

        
		var minLat = Geo.tile2lat(minY, coverageZoom)
		var maxLat = Geo.tile2lat(maxY+1, coverageZoom)

		var minLon = Geo.tile2long(minX, coverageZoom)
		var maxLon = Geo.tile2long(maxX+1, coverageZoom)

		var bounds = [minLon, minLat, maxLon, maxLat]
		var boundsString = bounds.join(",")

		var center = [(minLon + maxLon)/2, (minLat + maxLat)/2]
		var centerString = center.join(",")
        
        var metadataPath = this.outputPath.split("{")[0] + "metadata.json";
        var metadata = JSON.parse(await fs.promises.readFile(metadataPath, "utf8"));

        metadata.bounds = boundsString;
        metadata.center = centerString;
        
        await fs.promises.writeFile(metadataPath, JSON.stringify(metadata));
    }

    async close() {
        await this.flushTileQueue();
    }

}