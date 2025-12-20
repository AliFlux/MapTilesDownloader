<script>
	import { tick } from 'svelte';
	import Button, { Label } from "@smui/button";
	import IconButton, { Icon } from "@smui/icon-button";
	import { Svg } from "@smui/common/elements";
	import { mdiClose } from "@mdi/js";
	import Textfield from "@smui/textfield";
	import Select, { Option } from "@smui/select";
	import { Map, Geocoder, Marker, controls } from "@beyonk/svelte-mapbox";
	import { SvelteToast } from "@zerodevx/svelte-toast";
	import { toast } from "@zerodevx/svelte-toast";
	import ProgressBar from "@okrad/svelte-progressbar";

	import Section from "./components/Section.svelte";
	import MapboxDraw from "./components/MapboxDraw.svelte";
	import MapboxPolygon from "./components/MapboxPolygon.svelte";
	import Geo from "./Utils/Geo.js";
	import Misc from "./Utils/Misc";
	import ToBackend from "./ipc/ToBackend"

	let stage = "plan"; // plan, download

	let mapComponent = null;
	let mapDrawComponent = null;
	let mapGeocoder = null;
	let loggerComponent = null;

	let zoomFrom = 0;
	let zoomTo = 15;

	let customSource = false;
	let mapTileSource = "";
	let mapTileSourceURL = "";
	let outputType = "";
	let outputScale = "1";
	let maxParallelDownloads = 4;
	let outputPath = "";
	let aborting = false;

	let totalTiles = 100;
	let tilesProcessed = 0;
	let faultyTiles = 0;
	let etaSeconds = 0;
	let tilesPerSecond = 0;

	let logLines = [];
	let logs = "";
	let recentTiles = [];

	let progressBarThresholds = [
		{
			till: 0,
			color: '#0fb9b1'
		},
		{
			till: 100,
			color: '#20bf6b'
		},
	];



	let gridPreviewed = false;
	let polygons = [];

	var sources = {
		"Bing Maps":
			"http://ecn.t0.tiles.virtualearth.net/tiles/r{quadkey}.jpeg?g=129&mkt=en&stl=H",
		"Bing Maps Satellite":
			"http://ecn.t0.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=129&mkt=en&stl=H",
		"Bing Maps Hybrid":
			"http://ecn.t0.tiles.virtualearth.net/tiles/h{quadkey}.jpeg?g=129&mkt=en&stl=H",

		// https://atlas.microsoft.com/map/imagery/png?language=NGT&view=Auto&api-version=1.0&layer=basic&style=satellite&zoom=18&x=130962&y=87174&billing=hybrid-imagery

		"div-1B": "",

		"Google Maps": "https://mt0.google.com/vt?lyrs=m&x={x}&s=&y={y}&z={z}",
		"Google Maps Satellite":
			"https://mt0.google.com/vt?lyrs=s&x={x}&s=&y={y}&z={z}",
		"Google Maps Hybrid":
			"https://mt0.google.com/vt?lyrs=y&x={x}&s=&y={y}&z={z}",
		"Google Maps Terrain":
			"https://mt0.google.com/vt?lyrs=p&x={x}&s=&y={y}&z={z}",

		"div-2": "",

		"Open Street Maps": "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
		"Open Cycle Maps":
			"http://a.tile.opencyclemap.org/cycle/{z}/{x}/{y}.png",
		"Open PT Transport": "http://openptmap.org/tiles/{z}/{x}/{y}.png",

		"div-3": "",

		"ESRI World Imagery":
			"http://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
		"Wikimedia Maps": "https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png",
		// "NASA GIBS":
		// 	"https://map1.vis.earthdata.nasa.gov/wmts-webmerc/MODIS_Terra_CorrectedReflectance_TrueColor/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg",

		"div-4": "",

		"Carto Light":
			"http://cartodb-basemaps-c.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png",
		"Stamen Toner B&W": "http://a.tile.stamen.com/toner/{z}/{x}/{y}.png",
	};

	$: mapTileSource,
		(mapTileSourceURL = mapTileSource),
		(customSource = false);
	mapTileSource = sources["Bing Maps Satellite"];

	$: outputType,
		resetOutputPath();
	outputType = "directory";

	function drawRectangleClicked() {
		mapDrawComponent.startDrawing("draw_rectangle");
		toast.push("Click two points on the map to make a rectangle.");
	}

	function drawPolygonClicked() {
		mapDrawComponent.startDrawing("draw_polygon");
		toast.push("Click multiple points on the map to make a polygon.");
	}

	function drawingComplete(e) {
		// region = e.detail;
		toast.pop(0);
	}

	function mapTileSourceURLKeyDown() {
		customSource = true;
	}

	function resetOutputPath() {
		if(outputType == "directory") {
			outputPath = "output/{timestamp}/{z}/{x}/{y}.{ext}";
		} else if(outputType == "mbtiles") {
			outputPath = "output/{timestamp}.mbtiles";
		} else if(outputType == "repo") {
			outputPath = "output/{timestamp}.repo";
		}
	}

	function mapSearched(e) {
		if (e.detail.result.bbox) {
			mapComponent.fitBounds([
				[e.detail.result.bbox[0], e.detail.result.bbox[1]],
				[e.detail.result.bbox[2], e.detail.result.bbox[3]],
			]);
		} else {
			mapComponent.flyTo({
				center: e.detail.result.center,
				zoom: 14,
			});
		}
	}

	function previewGrid() {
		var region = mapDrawComponent.getCoordinates();
		if (region == null || region.length == 0) {
			toast.push("You need to select a region first.");
			return;
		}

		var maxZoom = Math.max(zoomFrom, zoomTo);
		var grid = Geo.getGrid(region, maxZoom);

		var allPolygons = grid.map(
			(g) => g.tilePolygon.geometry.coordinates[0]
		);

		polygons = [
			{
				id: "grid",
				geometries: allPolygons,
				lineColor: "#fa8231",
			},
		];

		// showSatelliteImagery({
		// 	tileSize: 256,
		// 	type: "raster",
		// 	tiles: [mapTileSourceURL],
		// });

		toast.pop(0);
		toast.push(
			"Total " +
				allPolygons.length.toLocaleString() +
				" tiles in the region."
		);
		gridPreviewed = true;
	}

	function removeGrid() {
		polygons = [];
		// revertSatelliteImagery();
		gridPreviewed = false;
	}

	function logItem(x, y, z, text) {
		logItemRaw(x + ',' + y + ',' + z + ' : ' + text)
	}

	// TODO optimize this!
	// Profiler says it takes a lot of time
	async function logItemRaw(text) {

		const maxLines = 2500;

		logLines.push(text);
		if(logLines.length > maxLines) {
			logLines.splice(0, logLines.length - maxLines);
		}

		var allText = logLines.join('\n');
		logs = allText;

		await tick();

		if(loggerComponent) {
			// TODO only scroll down if we are at end
			loggerComponent.scrollTop = loggerComponent.scrollHeight;
		}
	}

	async function startDownloading() {
		var region = mapDrawComponent.getCoordinates();
		if (region == null || region.length == 0) {
			toast.push("You need to select a region first.");
			return;
		}

		removeGrid();
		// mapDrawComponent.deleteAll();
		totalTiles = 100;
		tilesProcessed = 0;
		faultyTiles = 0;
		etaSeconds = 0;
		tilesPerSecond = 0;
		logLines = [];
		logs = "";
		recentTiles = [];
		toast.pop(0);
		stage = "download";
		aborting = false;

		await tick();

		logItemRaw("Planning download...");

		var downloadPlan = await ToBackend.startDownloading({ // why does this block UI on large tilesets?
			region: region,
			zoomFrom: zoomFrom,
			zoomTo: zoomTo,
			mapTileSourceURL : mapTileSourceURL,
			outputType: outputType,
			outputScale: outputScale,
			maxParallelDownloads: maxParallelDownloads,
			outputPath: outputPath,
			userAgent: navigator.userAgent,
		})

		totalTiles = downloadPlan.totalTiles;

		logItemRaw("Download started");
		
		if(downloadPlan.existingTiles) {
			logItemRaw("Ignoring " + downloadPlan.existingTiles.toLocaleString() + " existing tiles");
		}
	}

	async function stopDownloading() {
		aborting = true;
		await tick();
		await ToBackend.stopDownloading(); // flush + recalculate metadata...
		await tick();
		aborting = false;

		stage = "plan";
		polygons = [];
		
	}

	async function finishDownloading() {
		//...
		stage = "plan";
		polygons = [];
	}

	async function tileDownloadStart(tile) {
		if(stage != "download") {
			return;
		}
		
		polygons.push(
			{
				id: "grid:" + tile.id,
				geometries: tile.tilePolygon.geometry.coordinates,
				lineColor: "#fa8231",
			}
		);
		polygons = polygons;
	}

	async function tileDownloadEnd(tile, base64image) {
		if(stage != "download") {
			return;
		}

		polygons = polygons.filter(p =>  p.id != "grid:" + tile.id);

		recentTiles.push({
			x: tile.x,
			y: tile.y,
			z: tile.z,
			id: tile.id,
			src: base64image,
		})

		const maxTiles = 5;
		if(recentTiles.length > maxTiles) {
			recentTiles = recentTiles.splice(recentTiles.length - maxTiles);
		} else {
			recentTiles = recentTiles;
		}

		logItem(tile.x, tile.y, tile.z, "Tile Downloaded");
	}

	async function tileDownloadError(tile, data) {
		if(stage != "download") {
			return;
		}

		polygons = polygons.filter(p =>  p.id != "grid:" + tile.id);

		faultyTiles++;
		logItem(tile.x, tile.y, tile.z, data.error.message);
	}

	async function progressUpdate(data) {
		if(stage != "download") {
			return;
		}

		tilesProcessed = data.tilesDownloaded;
		etaSeconds = data.etaSeconds;
		tilesPerSecond = data.tilesPerSecond;
	}

	async function downloadFinished() {
		logItemRaw("Downloading Finished @ " + (new Date()).toLocaleString());

		if(faultyTiles > 0) {
			logItemRaw(faultyTiles + " tiles threw error while downloading");
		}
	}

	ToBackend.hook(tileDownloadStart);
	ToBackend.hook(tileDownloadEnd);
	ToBackend.hook(tileDownloadError);
	ToBackend.hook(progressUpdate);
	ToBackend.hook(downloadFinished);

</script>

<main>
	<div class="map-container">
		<SvelteToast
			options={{ reversed: true, intro: { y: 192 }, duration: 7000 }}
		/>

		<Map
			accessToken="pk.eyJ1IjoiYWxpYXNocmFmIiwiYSI6ImNqdXl5MHV5YTAzNXI0NG51OWFuMGp4enQifQ.zpd2gZFwBTRqiapp1yci9g"
			center={[-73.983652, 40.755024]}
			zoom={12}
			style={"mapbox://styles/aliashraf/ck6lw9nr80lvo1ipj8zovttdx"}
			bind:this={mapComponent}
		>
			<Geocoder
				bind:this={mapGeocoder}
				accessToken="pk.eyJ1IjoiYWxpYXNocmFmIiwiYSI6ImNqdXl5MHV5YTAzNXI0NG51OWFuMGp4enQifQ.zpd2gZFwBTRqiapp1yci9g"
				on:result={mapSearched}
			/>

			<MapboxDraw
				bind:this={mapDrawComponent}
				on:draw={drawingComplete}
			/>

			{#each polygons as polygon (polygon.id)}
				<MapboxPolygon
					geometries={polygon.geometries}
					lineColor={polygon.lineColor}
				/>
			{/each}
		</Map>
	</div>

	{#if stage == "plan"}
		<div class="sidebar">
			<!-- <div class="margin-below">
				<form on:submit|preventDefault={onSearch}>
					<Textfield class="search-bar" variant="filled" label="Search places" bind:value={searchText}></Textfield>
				</form>
			</div> -->

			<Section>
				<div slot="number">1</div>
				<div slot="title">Select a Region</div>
				<div class="centered">
					<Button variant="unelevated" on:click={drawRectangleClicked}>
						<Label>Rectangle</Label>
					</Button>
					<Button variant="outlined" on:click={drawPolygonClicked}>
						<Label>Polygon</Label>
					</Button>
				</div>
			</Section>

			<Section>
				<div slot="number">2</div>
				<div slot="title">Configure</div>
				<div class="centered">
					<div class="zoom-options margin-below">
						<Textfield type="number" label="Zoom From" bind:value={zoomFrom} />
						<Textfield type="number" label="Zoom To" bind:value={zoomTo} />
					</div>

					<div class="full-width-select margin-below">
						<Select label="Map Tile Source" bind:value={mapTileSource}>
							{#each Object.entries(sources) as [key, value]}
								{#if value == ""}
									<div class="divider" />
								{:else}
									<Option {value}>{key}</Option>
								{/if}
							{/each}
						</Select>
					</div>

					<div
						class={"full-width-text map-tile-source-url margin-below " +
							(customSource ? "custom-source" : "")}
					>
						<Textfield
							label="URL"
							bind:value={mapTileSourceURL}
							on:keydown={mapTileSourceURLKeyDown}
						/>
					</div>

					<div>
						<Button variant="unelevated" on:click={previewGrid}>
							<Label>Preview Grid</Label>
						</Button>
						<IconButton
							class="inline-icon"
							disabled={!gridPreviewed}
							on:click={removeGrid}
							size="mini"
						>
							<Icon component={Svg} viewBox="0 0 24 24">
								<path fill="currentColor" d={mdiClose} />
							</Icon>
						</IconButton>
					</div>
				</div>
			</Section>

			<Section expandable={true}>
				<div slot="number">3</div>
				<div slot="title">More Options</div>
				<div class="centered">
					<div class="full-width-select margin-below">
						<Select label="Output Type" bind:value={outputType}>
							<Option value="directory">Directory</Option>
							<Option value="mbtiles">Mbtiles</Option>
							<!-- <Option value="repo">Repo</Option> -->
						</Select>
					</div>

					<div class="full-width-select margin-below">
						<Select label="Output Scale-Up" bind:value={outputScale}>
							<Option value="1">1x</Option>
							<Option value="2">2x</Option>
						</Select>
					</div>

					<div class="full-width-text margin-below">
						<Textfield label="Parallel Downloads" type="number" bind:value={maxParallelDownloads} />
					</div>

					<div class="full-width-text margin-below">
						<Textfield label="Output Path" bind:value={outputPath} />
					</div>

				</div>
			</Section>

			<div class="floating-down-button">
				<Button variant="unelevated" on:click={startDownloading}>
					<Label>DOWNLOAD</Label>
				</Button>
			</div>
		</div>

	{:else if stage == "download"}

		<div class="sidebar">

			<Section>
				<div slot="number">4</div>
				<div slot="title">Downloading Tiles</div>
				<div>
					<div class="please-wait">Please wait...</div>
					<div class="centered">

						<div>
							<ProgressBar width={200} style='radial' thickness={12} series={Math.round(tilesProcessed/totalTiles * 100)} thresholds={progressBarThresholds} />
						</div>
						<div>
							<span class="highlight">{tilesProcessed.toLocaleString()}</span>
							<span class="subtle"> out of </span>
							<span class="highlight">{totalTiles.toLocaleString()}</span>
						</div>
						<div class="eta">
							<span>{tilesPerSecond.toLocaleString()} t/s. ETA {Misc.formatSeconds(etaSeconds)}</span>
						</div>
						<div class="recent-tiles">
							{#each recentTiles as tile (tile.id)}
								<img src={tile.src} alt="" title={tile.id} />
							{/each}
						</div>
						<textarea class="log-view" bind:this={loggerComponent}>{logs}</textarea>

					</div>

				</div>
			</Section>

			<div class="floating-down-button">
				{#if tilesProcessed != totalTiles}
					<Button variant="outlined" on:click={stopDownloading} 
						disabled={aborting}>
						<Label>STOP</Label>
					</Button>
				{:else}
					<Button variant="unelevated" on:click={finishDownloading}>
						<Label>FINISH</Label>
					</Button>
				{/if}
			</div>

		</div>

	{/if}

	<div class="title">MAP TILES DOWNLOADER</div>

</main>

<style type="text/scss">
	:root {
		--toastContainerTop: auto;
		--toastContainerRight: auto;
		--toastContainerBottom: 2rem;
		--toastContainerLeft: calc(50vw - 8rem);
	}

	:global(.mapboxgl-ctrl-geocoder.mapboxgl-ctrl) {
		top: 80px;
		left: 30px;
	}

	.title {
		font-size: 35px;
		font-weight: 700;
		font-family: "Open Sans";
		color: white;
		position: absolute;
		top: 18px;
		left: 30px;
		z-index: 10000000000000000;
		text-transform: uppercase;
		text-shadow: 0px 3px 15px rgb(0, 0, 0);
		letter-spacing: 2px;
		pointer-events: none;
	}

	.map-container {
		background: rgba(10, 40, 80, 0.1);
		position: absolute;
		top: 0px;
		left: 0px;
		right: 350px;
		bottom: 0px;
	}

	.sidebar {
		position: absolute;
		padding-top: 10px;
		top: 0px;
		width: 350px;
		right: 0px;
		bottom: 0px;
	}

	.margin-below {
		margin-bottom: 1em;
	}

	* :global(.search-bar) {
		width: 100%;
	}

	* :global(.zoom-options label) {
		width: 49%;
		margin: 0px;
	}

	* :global(.full-width-select > div) {
		width: 100%;
	}

	* :global(.full-width-text label) {
		width: 100%;
	}

	* :global(.map-tile-source-url label) {
		opacity: 0.5;
	}

	* :global(.map-tile-source-url.custom-source label) {
		opacity: 1;
	}

	.divider {
		height: 10px;
		margin-top: 0.5em;
		margin-bottom: 0.5em;
		background-color: rgba(0, 0, 0, 0.05);
	}

	.centered {
		text-align: center;
	}

	.floating-down-button {
		position: absolute;
		bottom: 30px;
		right: 30px;
		left: 30px;
	}

	* :global(.floating-down-button > button) {
		width: 100%;
		height: 45px;
		letter-spacing: 0.2em;
	}

	* :global(.inline-icon) {
		vertical-align: middle;
	}

	.please-wait {
		margin-top: -0.5em;
		opacity: 0.5;
	}

	.highlight {
		font-weight: 600;
	}

	.subtle {
		opacity: 0.5;
	}

	.eta {
		opacity: 0.6;
		margin-top: 0.5em;
		margin-bottom: 1em;
	}

	.recent-tiles {
		margin-bottom: 1em;
		display: flex;
		justify-content: space-between;
		min-height: 51px;

		img {
			width: 51px;
			height: 51px;
		}
	}

	.log-view {
		height: calc(100vh - 510px);
		width: 98%;
		border: 1px solid #cfd8dc;
		white-space: pre;
		overflow-wrap: normal;
		overflow-x: scroll;
	}

</style>
