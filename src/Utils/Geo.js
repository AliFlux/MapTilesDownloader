import * as turf from '@turf/turf'

export default class Geo {
    
	// static getArrayByBounds(bounds) {

	// 	var tileArray = [
	// 		[ bounds.getSouthWest().lng, bounds.getNorthEast().lat ],
	// 		[ bounds.getNorthEast().lng, bounds.getNorthEast().lat ],
	// 		[ bounds.getNorthEast().lng, bounds.getSouthWest().lat ],
	// 		[ bounds.getSouthWest().lng, bounds.getSouthWest().lat ],
	// 		[ bounds.getSouthWest().lng, bounds.getNorthEast().lat ],
	// 	];

	// 	return tileArray;
	// }

	static long2tile(lon,zoom) {
		var x = (Math.floor((lon+180)/360*Math.pow(2,zoom)));

		if(x < 0) {
			x = (Math.pow(2,zoom) + x)
		}

		return x;
	}

	static lat2tile(lat,zoom)  {
		var y = (Math.floor((1-Math.log(Math.tan(lat*Math.PI/180) + 1/Math.cos(lat*Math.PI/180))/Math.PI)/2 *Math.pow(2,zoom)));

		if(y < 0) {
			y = (Math.pow(2,zoom) + y)
		}

		return y;
	}

	static tile2long(x,z) {
		return (x/Math.pow(2,z)*360-180);
	}

	static tile2lat(y,z) {
		var n=Math.PI-2*Math.PI*y/Math.pow(2,z);
		return (180/Math.PI*Math.atan(0.5*(Math.exp(n)-Math.exp(-n))));
	}

	static getTilePolygon(x, y, zoom) {
        return turf.bboxPolygon([Geo.tile2long(x, zoom), Geo.tile2lat(y, zoom), Geo.tile2long(x + 1, zoom), Geo.tile2lat(y + 1, zoom)])
	}

	static getGrid(coordinates, zoomLevel) {

        var polygon = turf.polygon([coordinates]);
        var bbox = turf.bbox(polygon)

		var rects = [];
		var thisZoom = zoomLevel

		var LX = Geo.long2tile(bbox[0], thisZoom); // FIX negative X
		var BY = Geo.lat2tile(bbox[1], thisZoom);
		var RX  = Geo.long2tile(bbox[2], thisZoom); // FIX negative X
		var TY  = Geo.lat2tile(bbox[3], thisZoom);
        

		for(var y = TY; y <= BY; y++) {
			for(var x = LX; x <= RX; x++) {

				var tilePolygon = Geo.getTilePolygon(x, y, thisZoom);

				if(Geo.isTileInSelection(tilePolygon, polygon)) {
					rects.push({
						x: x,
						y: y,
						z: thisZoom,
						id: x + "," + y + "," + thisZoom,
						tilePolygon: tilePolygon,
					});
				}

			}
		}

		return rects
	}

	static isTileInSelection(tilePolygon, polygon) {

		if(turf.booleanDisjoint(tilePolygon, polygon) == false) {
			return true;
		}

		return false;
	}

};