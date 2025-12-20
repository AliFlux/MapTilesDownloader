<script>
    import * as turf from '@turf/turf'
    import multipolygon from 'turf-multipolygon'
    import { getContext, onMount, onDestroy } from 'svelte'
    import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
    import { contextKey } from '@beyonk/svelte-mapbox/src/lib/components.js'

    const { getMap, getMapbox } = getContext(contextKey)
    const map = getMap()
    const mapbox = getMapbox()
    let id = Math.random();
    let mounted = false;

    export let geometries = null;
    export let lineColor = "#fa8231";
    export let lineWidth = 3;


    $: if(mounted && geometries) {
        map.getSource("custom:" + id).setData(turf.polygon(geometries))
    }

    $: if(mounted && lineColor) {
        map.setPaintProperty("custom:" + id, 'line-color', lineColor);
    }

    $: if(mounted && lineWidth) {
        map.setPaintProperty("custom:" + id, 'line-width', lineWidth);
    }
 
    function addLayer() {
        map.addLayer({
            'id': "custom:" + id,
            'type': 'line',
            'source': {
                'type': 'geojson',
                'data': turf.polygon(geometries),
            },
            'layout': {},
            'paint': {
                "line-color": lineColor,
                "line-width": lineWidth,
            }
        }); 
        // console.log("mounted", geometries)
        mounted = true;
    }

    addLayer();
    // onMount(() => {
    //     // if(map.isStyleLoaded()) {
    //     // } else {
    //     //     map.once("style.load", addLayer);
    //     // }

    // })

    onDestroy(() => {
        // console.log("DESTROYING")
        map.removeLayer("custom:" + id);
        map.removeSource("custom:" + id);
        mounted = false;
    })


</script>