<script>
    import { getContext, onMount, getAllContexts, createEventDispatcher } from 'svelte'
    import MapboxDraw from "@mapbox/mapbox-gl-draw";
    import DrawRectangle from 'mapbox-gl-draw-rectangle-mode';
    import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
    import { contextKey } from '@beyonk/svelte-mapbox/src/lib/components.js'

    const { getMap, getMapbox } = getContext(contextKey)
    const map = getMap()
    const mapbox = getMapbox()
    const dispatcher = createEventDispatcher();

    var modes = MapboxDraw.modes;
    modes.draw_rectangle = DrawRectangle;

    let draw = new MapboxDraw({
        modes: modes,
        displayControlsDefault: false,
    });

    map.addControl(draw);

    map.on('draw.create', function (e) {
        // console.log(e.features[0].geometry.coordinates[0]);
        dispatcher("draw", e.features[0].geometry.coordinates[0]);
    });


    // draw.deleteAll();
    // draw.changeMode('draw_rectangle');

    export function startDrawing(mode = 'draw_rectangle') {
        draw.deleteAll();
        draw.changeMode(mode);
    }

    export function deleteAll() {
        draw.deleteAll();
    }

    export function getCoordinates() {
        if(draw.getAll().features.length == 0) {
            return null;
        }

        return draw.getAll().features[0].geometry.coordinates[0];
    }

</script>

<style>


/* 
:global(.mapboxgl-ctrl-geocoder) {
	display: none !important;
} */
/* 
:global(.mapbox-gl-draw_ctrl-draw-btn) {
	display: none !important;
} */


</style>