$(function () {
  // ─── State ───────────────────────────────────────────────────────────────
  var map = null;
  var tileLayer = null;
  var drawnBounds = null;
  var drawnLayer = null;
  var previewLayers = {};
  var bar = null;
  var cancellationToken = false;
  var requests = [];
  var drawHandler = null;

  // ─── Tile Sources ─────────────────────────────────────────────────────────
  var sources = {
    // ESRI
    "ESRI Street":
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    "ESRI Satellite":
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    "ESRI Topo":
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    "ESRI Light Gray":
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    "ESRI Dark Gray":
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    "ESRI National Geographic":
      "https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}",
    "ESRI Ocean":
      "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
    "ESRI Shaded Relief":
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}",
    // OpenStreetMap
    OpenStreetMap: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    "OSM Humanitarian": "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
    OpenTopoMap: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    // CartoDB
    "CartoDB Positron":
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
    "CartoDB Dark Matter":
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    "CartoDB Voyager":
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
    // Stadia
    "Stadia Smooth":
      "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png",
    "Stadia Smooth Dark":
      "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png",
    "Stadia Outdoors":
      "https://tiles.stadiamaps.com/tiles/outdoors/{z}/{x}/{y}.png",
    // Google
    "Google Maps": "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
    "Google Satellite": "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    "Google Hybrid": "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
    "Google Terrain": "https://mt1.google.com/vt/lyrs=t&x={x}&y={y}&z={z}",
    // NASA
    "NASA Blue Marble":
      "https://map1.vis.earthdata.nasa.gov/wmts-webmerc/BlueMarble_ShadedRelief/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg",
  };

  // ─── Initialize Map ───────────────────────────────────────────────────────
  function initializeMap() {
    map = L.map("map-view").setView([40.755024, -73.983652], 12);

    tileLayer = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
      { attribution: "Tiles &copy; Esri", maxZoom: 20 },
    ).addTo(map);

    // Click popup (Ctrl+Click to show tile coords)
    map.on("click", function (e) {
      if (!e.originalEvent.ctrlKey) return;
      var maxZoom = getMaxZoom();
      var x = long2tile(e.latlng.lng, maxZoom);
      var y = lat2tile(e.latlng.lat, maxZoom);
      var content =
        "X, Y, Z<br/><b>" + x + ", " + y + ", " + maxZoom + "</b><hr/>";
      content +=
        "Lat, Lng<br/><b>" +
        e.latlng.lat.toFixed(6) +
        ", " +
        e.latlng.lng.toFixed(6) +
        "</b>";
      L.popup().setLatLng(e.latlng).setContent(content).openOn(map);
    });
  }

  // ─── Materialize UI ───────────────────────────────────────────────────────
  function initializeMaterialize() {
    $("select").formSelect();
    $(".dropdown-trigger").dropdown({ constrainWidth: false });
  }

  // ─── Source Dropdown ──────────────────────────────────────────────────────
  function initializeSources() {
    var dropdown = $("#sources");
    for (var key in sources) {
      var url = sources[key];
      var item = $("<li><a></a></li>");
      item.attr("data-url", url);
      item.find("a").text(key);
      item.click(function () {
        var url = $(this).attr("data-url");
        $("#source-box").val(url);
        // Switch the background preview layer too
        if (tileLayer) map.removeLayer(tileLayer);
        tileLayer = L.tileLayer(url, { attribution: "", maxZoom: 20 }).addTo(
          map,
        );
      });
      dropdown.append(item);
    }
  }

  // ─── Search ───────────────────────────────────────────────────────────────
  function initializeSearch() {
    $("#search-form").submit(function (e) {
      e.preventDefault();
      var location = $("#location-box").val();
      fetch(
        "https://nominatim.openstreetmap.org/search?format=json&q=" +
          encodeURIComponent(location),
      )
        .then(function (r) {
          return r.json();
        })
        .then(function (results) {
          if (results.length > 0) {
            map.setView(
              [parseFloat(results[0].lat), parseFloat(results[0].lon)],
              13,
            );
          } else {
            M.toast({ html: "Location not found.", displayLength: 3000 });
          }
        })
        .catch(function () {
          M.toast({
            html: "Search failed. Check your connection.",
            displayLength: 3000,
          });
        });
    });
  }

  // ─── More Options Toggle ──────────────────────────────────────────────────
  function initializeMoreOptions() {
    $("#more-options-toggle").click(function () {
      $("#more-options").toggle();
    });

    $("#output-type").change(function () {
      var outputType = $(this).val();
      if (outputType === "mbtiles") {
        $("#output-file-box").val("tiles.mbtiles");
      } else if (outputType === "repo") {
        $("#output-file-box").val("tiles.repo");
      } else {
        $("#output-file-box").val("{z}/{x}/{y}.png");
      }
    });
  }

  // ─── Rectangle Draw Tool ──────────────────────────────────────────────────
  function initializeRectangleTool() {
    var drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    drawHandler = new L.Draw.Rectangle(map, {
      shapeOptions: { color: "#fa8231", weight: 2 },
    });

    map.on(L.Draw.Event.CREATED, function (e) {
      if (drawnLayer) map.removeLayer(drawnLayer);
      drawnLayer = e.layer;
      drawnBounds = e.layer.getBounds();
      map.addLayer(drawnLayer);
      M.Toast.dismissAll();
      updateRectangleButtons();
    });

    // ESC key cancels drawing
    $(document).keydown(function (e) {
      if (e.key === "Escape") cancelDrawing();
    });

    // Also cancel if draw is stopped without completing
    map.on(L.Draw.Event.DRAWSTOP, function () {
      $("#cancel-draw-button").hide();
    });

    $("#rectangle-draw-button").click(function () {
      startDrawing();
    });

    $("#cancel-draw-button").click(function () {
      cancelDrawing();
    });

    $("#reset-rectangle-button").click(function () {
      resetRectangle();
    });
  }

  function updateRectangleButtons() {
    if (drawnBounds) {
      $("#reset-rectangle-button").show();
      $("#cancel-draw-button").hide();
      $("#rectangle-draw-button").text("Redraw Rectangle");
    } else {
      $("#reset-rectangle-button").hide();
      $("#rectangle-draw-button").text("Draw a Rectangle");
    }
  }

  function startDrawing() {
    removeGrid();
    drawHandler.enable();
    $("#cancel-draw-button").show();
    $("#reset-rectangle-button").hide();

    M.Toast.dismissAll();
    M.toast({
      html: "Click and drag on the map to draw a rectangle. <b>ESC</b> to cancel.",
      displayLength: 7000,
    });
  }

  function cancelDrawing() {
    drawHandler.disable();
    $("#cancel-draw-button").hide();
    M.Toast.dismissAll();
    updateRectangleButtons();
  }

  function resetRectangle() {
    removeGrid();
    if (drawnLayer) {
      map.removeLayer(drawnLayer);
      drawnLayer = null;
    }
    drawnBounds = null;
    $("#reset-rectangle-button").hide();
    $("#rectangle-draw-button").text("Draw a Rectangle");
    M.toast({ html: "Rectangle cleared.", displayLength: 2000 });
  }

  // ─── Grid Preview ─────────────────────────────────────────────────────────
  function initializeGridPreview() {
    $("#grid-preview-button").click(previewGrid);
  }

  function previewGrid() {
    if (!drawnBounds) {
      M.toast({ html: "Draw a rectangle first.", displayLength: 3000 });
      return;
    }

    var maxZoom = getMaxZoom();
    var grid = getGrid(maxZoom);
    removeGrid();

    for (var i = 0; i < grid.length; i++) {
      var feature = grid[i];
      var b = feature.rect;
      var rect = L.rectangle(b, { color: "#fa8231", weight: 2, fill: false });
      rect.addTo(map);
      previewLayers["grid-" + i] = rect;
    }

    var totalTiles = getAllGridTiles().length;
    M.toast({
      html: "Total " + totalTiles.toLocaleString() + " tiles in the region.",
      displayLength: 5000,
    });
  }

  function removeGrid() {
    for (var key in previewLayers) {
      map.removeLayer(previewLayers[key]);
    }
    previewLayers = {};
  }

  function previewRect(rectInfo) {
    var id = "temp-" + rectInfo.x + "-" + rectInfo.y + "-" + rectInfo.z;
    var rect = L.rectangle(rectInfo.rect, {
      color: "#ff9f1a",
      weight: 2,
      fill: false,
    });
    rect.addTo(map);
    previewLayers[id] = rect;
    return id;
  }

  function removeLayer(id) {
    if (previewLayers[id]) {
      map.removeLayer(previewLayers[id]);
      delete previewLayers[id];
    }
  }

  // ─── Tile Math ────────────────────────────────────────────────────────────
  function long2tile(lon, zoom) {
    return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
  }

  function lat2tile(lat, zoom) {
    return Math.floor(
      ((1 -
        Math.log(
          Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180),
        ) /
          Math.PI) /
        2) *
        Math.pow(2, zoom),
    );
  }

  function tile2long(x, z) {
    return (x / Math.pow(2, z)) * 360 - 180;
  }

  function tile2lat(y, z) {
    var n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }

  function getTileRect(x, y, zoom) {
    var south = tile2lat(y + 1, zoom);
    var north = tile2lat(y, zoom);
    var west = tile2long(x, zoom);
    var east = tile2long(x + 1, zoom);
    return L.latLngBounds([
      [south, west],
      [north, east],
    ]);
  }

  // ─── Zoom Helpers ─────────────────────────────────────────────────────────
  function getMinZoom() {
    return Math.min(
      parseInt($("#zoom-from-box").val()),
      parseInt($("#zoom-to-box").val()),
    );
  }

  function getMaxZoom() {
    return Math.max(
      parseInt($("#zoom-from-box").val()),
      parseInt($("#zoom-to-box").val()),
    );
  }

  // ─── Bounds Helpers ───────────────────────────────────────────────────────
  function getBounds() {
    return {
      getSouthWest: function () {
        return { lng: drawnBounds.getWest(), lat: drawnBounds.getSouth() };
      },
      getNorthEast: function () {
        return { lng: drawnBounds.getEast(), lat: drawnBounds.getNorth() };
      },
      getCenter: function () {
        return {
          lng: drawnBounds.getCenter().lng,
          lat: drawnBounds.getCenter().lat,
        };
      },
    };
  }

  function isTileInSelection(tileRect) {
    // Check overlap: tile rect intersects drawn bounds
    return drawnBounds.intersects(tileRect);
  }

  // ─── Grid Calculation ─────────────────────────────────────────────────────
  function getGrid(zoomLevel) {
    var TY = lat2tile(drawnBounds.getNorth(), zoomLevel);
    var BY = lat2tile(drawnBounds.getSouth(), zoomLevel);
    var LX = long2tile(drawnBounds.getWest(), zoomLevel);
    var RX = long2tile(drawnBounds.getEast(), zoomLevel);

    var rects = [];
    for (var y = TY; y <= BY; y++) {
      for (var x = LX; x <= RX; x++) {
        var rect = getTileRect(x, y, zoomLevel);
        if (isTileInSelection(rect)) {
          rects.push({ x: x, y: y, z: zoomLevel, rect: rect });
        }
      }
    }
    return rects;
  }

  function getAllGridTiles() {
    var allTiles = [];
    for (var z = getMinZoom(); z <= getMaxZoom(); z++) {
      allTiles = allTiles.concat(getGrid(z));
    }
    return allTiles;
  }

  // ─── Quad Key ─────────────────────────────────────────────────────────────
  function generateQuadKey(x, y, z) {
    var quadKey = [];
    for (var i = z; i > 0; i--) {
      var digit = "0";
      var mask = 1 << (i - 1);
      if ((x & mask) !== 0) digit++;
      if ((y & mask) !== 0) {
        digit++;
        digit++;
      }
      quadKey.push(digit);
    }
    return quadKey.join("");
  }

  // ─── Downloader ───────────────────────────────────────────────────────────
  function initializeDownloader() {
    bar = new ProgressBar.Circle($("#progress-radial").get(0), {
      strokeWidth: 12,
      easing: "easeOut",
      duration: 200,
      trailColor: "#eee",
      trailWidth: 1,
      from: { color: "#0fb9b1", a: 0 },
      to: { color: "#20bf6b", a: 1 },
      svgStyle: null,
      step: function (state, circle) {
        circle.path.setAttribute("stroke", state.color);
      },
    });

    $("#download-button").click(startDownloading);
    $("#stop-button").click(stopDownloading);
  }

  function showTinyTile(base64) {
    var currentImages = $(".tile-strip img");
    for (var i = 4; i < currentImages.length; i++) {
      $(currentImages[i]).remove();
    }
    var image = $("<img/>").attr("src", "data:image/png;base64, " + base64);
    $(".tile-strip").prepend(image);
  }

  async function startDownloading() {
    if (!drawnBounds) {
      M.toast({
        html: "You need to select a region first.",
        displayLength: 3000,
      });
      return;
    }

    cancellationToken = false;
    requests = [];

    $("#main-sidebar").hide();
    $("#download-sidebar").show();
    $(".tile-strip").html("");
    $("#stop-button").html("STOP");
    removeGrid();
    clearLogs();
    M.Toast.dismissAll();

    var timestamp = Date.now().toString();
    var allTiles = getAllGridTiles();
    updateProgress(0, allTiles.length);

    var numThreads = parseInt($("#parallel-threads-box").val());
    var outputDirectory = $("#output-directory-box").val();
    var outputFile = $("#output-file-box").val();
    var outputType = $("#output-type").val();
    var outputScale = $("#output-scale").val();
    var source = $("#source-box").val();

    var bounds = getBounds();
    var boundsArray = [
      bounds.getSouthWest().lng,
      bounds.getSouthWest().lat,
      bounds.getNorthEast().lng,
      bounds.getNorthEast().lat,
    ];
    var centerArray = [
      bounds.getCenter().lng,
      bounds.getCenter().lat,
      getMaxZoom(),
    ];

    var startData = new FormData();
    startData.append("minZoom", getMinZoom());
    startData.append("maxZoom", getMaxZoom());
    startData.append("outputDirectory", outputDirectory);
    startData.append("outputFile", outputFile);
    startData.append("outputType", outputType);
    startData.append("outputScale", outputScale);
    startData.append("source", source);
    startData.append("timestamp", timestamp);
    startData.append("bounds", boundsArray.join(","));
    startData.append("center", centerArray.join(","));

    await $.ajax({
      url: "/start-download",
      async: true,
      timeout: 30 * 1000,
      type: "post",
      contentType: false,
      processData: false,
      data: startData,
      dataType: "json",
    });

    var i = 0;
    async.eachLimit(
      allTiles,
      numThreads,
      function (item, done) {
        if (cancellationToken) return;

        var boxLayer = previewRect(item);
        var tileData = new FormData();
        tileData.append("x", item.x);
        tileData.append("y", item.y);
        tileData.append("z", item.z);
        tileData.append("quad", generateQuadKey(item.x, item.y, item.z));
        tileData.append("outputDirectory", outputDirectory);
        tileData.append("outputFile", outputFile);
        tileData.append("outputType", outputType);
        tileData.append("outputScale", outputScale);
        tileData.append("timestamp", timestamp);
        tileData.append("source", source);
        tileData.append("bounds", boundsArray.join(","));
        tileData.append("center", centerArray.join(","));

        var request = $.ajax({
          url: "/download-tile",
          async: true,
          timeout: 30 * 1000,
          type: "post",
          contentType: false,
          processData: false,
          data: tileData,
          dataType: "json",
        })
          .done(function (data) {
            if (cancellationToken) return;
            if (data.code === 200) {
              showTinyTile(data.image);
              logItem(item.x, item.y, item.z, data.message);
            } else {
              logItem(
                item.x,
                item.y,
                item.z,
                data.code + " Error downloading tile",
              );
            }
          })
          .fail(function () {
            if (cancellationToken) return;
            logItem(item.x, item.y, item.z, "Error while relaying tile");
          })
          .always(function () {
            i++;
            removeLayer(boxLayer);
            updateProgress(i, allTiles.length);
            done();
          });

        requests.push(request);
      },
      async function () {
        await $.ajax({
          url: "/end-download",
          async: true,
          timeout: 30 * 1000,
          type: "post",
          contentType: false,
          processData: false,
          data: startData,
          dataType: "json",
        });

        updateProgress(allTiles.length, allTiles.length);
        logItemRaw("All requests are done");
        $("#stop-button").html("FINISH");
      },
    );
  }

  function stopDownloading() {
    cancellationToken = true;
    for (var i = 0; i < requests.length; i++) {
      try {
        requests[i].abort();
      } catch (e) {}
    }
    $("#main-sidebar").show();
    $("#download-sidebar").hide();
    removeGrid();
    clearLogs();
  }

  // ─── Progress & Logs ─────────────────────────────────────────────────────
  function updateProgress(value, total) {
    var progress = total === 0 ? 0 : value / total;
    bar.animate(progress);
    bar.setText(Math.round(progress * 100) + "<span>%</span>");
    $("#progress-subtitle").html(
      value.toLocaleString() + " <span>out of</span> " + total.toLocaleString(),
    );
  }

  function logItem(x, y, z, text) {
    logItemRaw(x + "," + y + "," + z + " : " + text);
  }

  function logItemRaw(text) {
    var logger = $("#log-view");
    logger.val(logger.val() + "\n" + text);
    logger.scrollTop(logger[0].scrollHeight);
  }

  function clearLogs() {
    $("#log-view").val("");
  }

  // ─── Boot ────────────────────────────────────────────────────────────────
  initializeMaterialize();
  initializeMap();
  initializeSources();
  initializeSearch();
  initializeRectangleTool();
  initializeGridPreview();
  initializeMoreOptions();
  initializeDownloader();
});
