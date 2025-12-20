const ToFrontend = require('../ipc/ToFrontend.js');
const Geo = require('../Utils/GeoCJS.js')
var async = require("async");
const superagent = require('superagent');
var images = require("images");
var Agent = require('agentkeepalive');

var keepaliveAgent = new Agent({
    maxSockets: 100,
    maxFreeSockets: 10,
    timeout: 60000,
    freeSocketTimeout: 10000 // free socket keepalive for 10 seconds
});

var keepaliveAgentHTTPS = new Agent.HttpsAgent({
    maxSockets: 100,
    maxFreeSockets: 10,
    timeout: 60000,
    freeSocketTimeout: 10000 // free socket keepalive for 10 seconds
});

const providers = {
    "mbtiles": require('./Mbtiles.js'),
    "directory": require('./Directory.js'),
    // TODO implement geopackage
    // TODO implement ESRI tpk
}

class DownloadController {

    static allTiles = [];
    static options = null;
    static queue = null;
    static extension = "jpeg";
    static tilesDownloaded = 0;
    static startTime = null;
    static provider = null;
    static existingTilesCount = 0;

    // TODO push these methods to some utils file

    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static formatTimestamp(date) {
        var year = date.getFullYear();
        var month = date.getMonth() + 1;
        var day = date.getDate();
        var hour = date.getHours();
        var minutes = date.getMinutes();
        var secconds = date.getSeconds()

        return day + '-' + month + '-' + year + '-' + hour + '-' + minutes + '-' + secconds;
    }

    // Hacky way to infer extension without parsing image
    static inferExtension(url) {
        url = url.toLowerCase();
        if (url.includes("png")) {
            return "png";
        } else {
            return "jpeg";
        } // TODO implement webp (images lib doesnt support it...)
    }

    // TODO catch exceptions in UI
    static async startDownloading(options) {
        DownloadController.options = options;
        DownloadController.tilesDownloaded = 0;
        DownloadController.startTime = Date.now();

        var minZoom = Math.min(options.zoomFrom, options.zoomTo);
        var maxZoom = Math.max(options.zoomFrom, options.zoomTo);
        DownloadController.extension = DownloadController.inferExtension(options.mapTileSourceURL);

        DownloadController.allTiles = [];

        for (var z = minZoom; z <= maxZoom; z++) {
            var theseTiles = Geo.getGrid(options.region, z);
            DownloadController.allTiles = DownloadController.allTiles.concat(theseTiles);
        }

        var bounds = Geo.getCoordinatesBounds(options.region);
        var center = Geo.getCoordinatesCenter(options.region);

        var outputPath = options.outputPath;
        outputPath = outputPath.replace("{timestamp}", DownloadController.formatTimestamp(new Date()));
        outputPath = outputPath.replace("{ext}", DownloadController.extension);

        DownloadController.provider = await new providers[options.outputType](outputPath, {
			"attribution": "Downloaded from " + options.mapTileSourceURL,
			"format": DownloadController.extension, 
			"minZoom": minZoom,
			"maxZoom": maxZoom,
			"tileSize": 256 * options.outputScale,
			"bounds": bounds,
			"center": center,
        });

        // get all existing tiles and subtract from allTiles;
        const existingTiles = await DownloadController.provider.listAll();
        const existingTileIDs = existingTiles.reduce((acc,t)=> (acc[t.id]=true,acc),{});

        var beforeFilterLength = DownloadController.allTiles.length;
        DownloadController.allTiles = DownloadController.allTiles.filter(t => {
            return !(t.id in existingTileIDs);
        })

        // TODO random, himlet, zigzag, ordered sorting...

        DownloadController.queue = async.queue(DownloadController.processTile, options.maxParallelDownloads);
        DownloadController.queue.push(DownloadController.allTiles);

        DownloadController.queue.error(function (err, task) {
            console.error('task experienced an error?', err);
        });

        DownloadController.queue.drain(async () => {
            await DownloadController.stopDownloading();
            await ToFrontend.downloadFinished();
        });

        return {
            totalTiles: DownloadController.allTiles.length,
            existingTiles: beforeFilterLength - DownloadController.allTiles.length,
        };
    }

    static async downloadTile(x, y, z) {

        var url = DownloadController.options.mapTileSourceURL;
        url = url
            .replace("{x}", x)
            .replace("{y}", y)
            .replace("{z}", z)
            .replace("{quadkey}", Geo.generateQuadKey(x, y, z));

        var agent = keepaliveAgent;
        if(url.toLowerCase().startsWith("https:")) {
            agent = keepaliveAgentHTTPS;
        }

        var request = await superagent.get(url)
            .agent(agent)
            .retry(3)
            .set('Referrer', url)
            .set('User-Agent', DownloadController.options.userAgent)
            .buffer(true);
            
        var buffer = request.body;

        return buffer;
    }

    static async downloadTileScaled(x, y, z) {
        
        if(DownloadController.options.outputScale == 1) {
            return await DownloadController.downloadTile(x, y, z);
        } else if (DownloadController.options.outputScale == 2) {
            var buffers = [ // must fail by design if any tile isnt downloaded
                await DownloadController.downloadTile(x*2, y*2, z+1),
                await DownloadController.downloadTile(x*2+1, y*2, z+1),
                await DownloadController.downloadTile(x*2+1, y*2+1, z+1),
                await DownloadController.downloadTile(x*2, y*2+1, z+1)
            ];

            var tiles = buffers.map(b => images(b));
            const baseSize = tiles[0]._handle.height;
            
            var canvasBuffer = images(baseSize * 2, baseSize * 2)
                .draw(tiles[0], 0, 0)
                .draw(tiles[1], baseSize, 0)
                .draw(tiles[2], baseSize, baseSize)
                .draw(tiles[3], 0, baseSize)
                .encode(DownloadController.extension); // TODO take in another thread

            return canvasBuffer;
        } else {
            // TODO implement n scale algorithm
        }
    }

    static async processTile(tile) {
        ToFrontend.tileDownloadStart(tile);

        try {

            var buffer = await DownloadController.downloadTileScaled(tile.x, tile.y, tile.z);
            
            if(DownloadController.provider == null) {
                // stopped
                return;
            }
    
            DownloadController.provider.addTileDelayed(tile, buffer);
            ToFrontend.tileDownloadEnd(tile, "data:image/" + DownloadController.extension + ";base64, " + buffer.toString('base64')); // async b64 is actually slower!

        } catch(e) {
            // console.log(e);
            
            ToFrontend.tileDownloadError(tile, {
                error: e,
                code: 500
            });
        }


        DownloadController.tilesDownloaded++;

        var secondsElapsed = (Date.now() - DownloadController.startTime) / 1000;
        var tilesPerSecond = DownloadController.tilesDownloaded / secondsElapsed;
        var progress = DownloadController.tilesDownloaded / DownloadController.allTiles.length;
        var etaSeconds = (1 / progress * secondsElapsed) - secondsElapsed;

        ToFrontend.progressUpdate({
            tilesDownloaded: DownloadController.tilesDownloaded,
            etaSeconds: etaSeconds,
            tilesPerSecond: tilesPerSecond,
        })

        return;
    }

    static async stopDownloading() {
        console.log("HALTTTT")
        if(DownloadController.queue) {
            DownloadController.queue.kill();
            DownloadController.queue = null;
        }

        DownloadController.allTiles = [];
        DownloadController.options = null;
        DownloadController.tilesDownloaded = 0;
        DownloadController.startTime = null;
        DownloadController.existingTilesCount = 0;
        
        if(DownloadController.provider) {
            await DownloadController.provider.calculateMetadata();
            DownloadController.provider.close();
            DownloadController.provider = null;
        }
    }

    static async openDirectory() {

    }

    static attach(window) {
        ToFrontend.attach(window);
    }
}

ToFrontend.hook("startDownloading", DownloadController.startDownloading);
ToFrontend.hook("stopDownloading", DownloadController.stopDownloading);
ToFrontend.hook("openDirectory", DownloadController.openDirectory);


module.exports = DownloadController;