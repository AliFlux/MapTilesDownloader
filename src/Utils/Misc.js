
export default class Misc {

	replaceSatelliteImagery(newSource) {
		let mapControl = mapComponent.getMap();
		var layers = mapControl.getStyle().layers;
		var sources = mapControl.getStyle().sources;
		let positionID = null;

		for (var layer of layers) {
			if (layer.type == "raster") {
				mapControl.removeLayer(layer.id);
				break;
			}
		}

		for (const [id, source] of Object.entries(sources)) {
			if (source.type == "raster") {
				mapControl.removeSource(id);
				break;
			}
		}

		for (var layer of layers) {
			if (layer.type != "raster" && layer.type != "background") {
				positionID = layer.id;
				break;
			}
		}


		mapControl.addLayer(
			{
				id: "custom-satellite",
				type: "raster",
				source: newSource,
			},
			positionID
		);
	}

	showSatelliteImagery(newSource) {
		let mapControl = mapComponent.getMap();
		if(mapControl.isStyleLoaded()) {
			mapControl.setStyle({ 
				"version": 8,
				"sources": {
					"custom-satellite-source": newSource,
				},
				"layers": [
					{
						id: "custom-satellite",
						type: "raster",
						source: "custom-satellite-source",
					},
				]
			})
		}
	}

	revertSatelliteImagery() {
		let mapControl = mapComponent.getMap();
		if(mapControl.isStyleLoaded()) {
			mapControl.setStyle("mapbox://styles/aliashraf/ck6lw9nr80lvo1ipj8zovttdx");
		}
	}
    
	static formatSeconds(time) {   
		// Hours, minutes and seconds
		var hrs = ~~(time / 3600);
		var mins = ~~((time % 3600) / 60);
		var secs = ~~time % 60;
	
		// Output like "1:01" or "4:03:59" or "123:03:59"
		var ret = "";
		if (hrs > 0) {
			ret += "" + hrs + ":" + (mins < 10 ? "0" : "");
		}
		ret += "" + mins + ":" + (secs < 10 ? "0" : "");
		ret += "" + secs;
		return ret;
	}

};


