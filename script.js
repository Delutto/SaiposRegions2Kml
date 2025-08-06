let areas = [];

const map = L.map('map', { editable: true }).setView([-27.571, -48.626], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
}).addTo(map);

function clearMap() {
    map.eachLayer(layer => {
        if (layer instanceof L.Polygon || layer instanceof L.Marker) {
            map.removeLayer(layer);
        }
    });
    document.getElementById('areaList').innerHTML = '';
    areas = [];
}

document.getElementById('uploadButton').addEventListener('click', () => {
    document.getElementById('jsonModal').style.display = 'flex';
    document.getElementById('jsonInput').focus();
});

document.getElementById('cancelModalButton').addEventListener('click', () => {
    document.getElementById('jsonModal').style.display = 'none';
    document.getElementById('jsonInput').value = '';
});

document.getElementById('processJsonButton').addEventListener('click', () => {
    const jsonInput = document.getElementById('jsonInput').value;
    try {
        const jsonData = JSON.parse(jsonInput);
        document.getElementById('jsonModal').style.display = 'none';
        document.getElementById('jsonInput').value = '';
        clearMap();
        processJSON(jsonData);
    } catch (error) {
        console.error("Erro capturado:", error);
        alert('Erro ao processar o JSON. Verifique a sintaxe ou a estrutura dos dados. Mais detalhes no console do navegador (F12).');
    }
});

document.getElementById('toKmlButton').addEventListener('click', () => { exportToKML(); });

const fullscreenButton = document.getElementById('fullscreenButton');
fullscreenButton.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.getElementById('map').requestFullscreen();
    } else {
        document.exitFullscreen();
    }
});

document.addEventListener('fullscreenchange', () => {
    fullscreenButton.style.display = document.fullscreenElement ? 'none' : 'block';
});

function addAreaCheckbox(areaName, layer, isChecked = true) {
    const areaList = document.getElementById('areaList');
    const listItem = document.createElement('li');
    listItem.className = 'area-item';
    const listItemContent = document.createElement('div');
    listItemContent.style.display = 'flex';
    listItemContent.style.justifyContent = 'space-between';
    listItemContent.style.alignItems = 'center';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isChecked;
    checkbox.onchange = function() {
        if (this.checked) {
            map.addLayer(layer);
            editButton.style.display = 'inline-block';
            editButton.disabled = false;
        } else {
            map.removeLayer(layer);
            if (layer.editEnabled()) layer.disableEdit();
            editButton.disabled = true;
        }
    };
    const editButton = document.createElement('button');
    editButton.textContent = 'Editar';
    editButton.className = 'button';
    editButton.style.marginLeft = '10px';
    editButton.onclick = function() {
        if (layer.editEnabled()) {
            layer.disableEdit();
            editButton.textContent = 'Editar';
        } else {
            layer.enableEdit();
            editButton.textContent = 'OK';
        }
    };
    listItemContent.appendChild(checkbox);
    listItemContent.appendChild(document.createTextNode(areaName));
    listItemContent.appendChild(editButton);
    listItem.appendChild(listItemContent);
    areaList.appendChild(listItem);
    
    // Controla a visibilidade inicial da camada
    if (!isChecked) {
        map.removeLayer(layer);
        editButton.disabled = true;
    }
}

function createLeafletLayer(turfGeometry, style) {
    if (!turfGeometry || !turfGeometry.geometry || !turfGeometry.geometry.coordinates || turfGeometry.geometry.coordinates.length === 0) return null;
    const type = turfGeometry.geometry.type;
    let leafletLayer;
    if (type === "Polygon") {
        const leafletCoords = turfGeometry.geometry.coordinates.map(ring =>
            ring.map(coord => [coord[1], coord[0]])
        );
        leafletLayer = L.polygon(leafletCoords, style);
    } else if (type === "MultiPolygon") {
        const leafletCoords = turfGeometry.geometry.coordinates.map(polygon =>
            polygon.map(ring => ring.map(coord => [coord[1], coord[0]]))
        );
        leafletLayer = L.polygon(leafletCoords, style);
    }
    return leafletLayer;
}

function processJSON(data) {
    const geometryFactory = new jsts.geom.GeometryFactory();
    const reader = new jsts.io.GeoJSONReader(geometryFactory);
    const writer = new jsts.io.GeoJSONWriter();

    // 1. Encontrar TODAS as áreas de serviço principais
    const mainAreaFeatures = data.filter(f => f.geometry && f.geometry.type === "Polygon" && f.properties.custom_layers);
    const pointFeature = data.find(f => f.geometry && f.geometry.type === "Point");

    if (mainAreaFeatures.length === 0 || !pointFeature) {
        alert("Não foi possível encontrar áreas de serviço ou o ponto de origem no JSON.");
        return;
    }

    // 2. Processar cada área principal com suas próprias camadas customizadas
    const processedGeoms = mainAreaFeatures.map(feature => {
        let baseGeom = reader.read(feature.geometry);
        const customLayers = feature.properties.custom_layers || [];
        
        customLayers.forEach(layer => {
            try {
                const layerGeom = reader.read(layer.geometry);
                if (!layerGeom.isValid()) return;

                if (layer.properties.area_circle_type === 'join') {
                    baseGeom = baseGeom.union(layerGeom);
                } else if (layer.properties.area_circle_type === 'remove') {
                    baseGeom = baseGeom.difference(layerGeom);
                }
            } catch (e) {
                console.error("Erro ao processar camada customizada com JSTS, ignorando. Erro:", e, "Camada:", layer);
            }
        });

        // Desenhar cada área processada individualmente
        const individualStyle = { color: 'blue', fillColor: 'blue', fillOpacity: 0.2, weight: 2 };
        const individualName = feature.properties.desc_store_district || "Região Atendida";
        const individualGeoJSON = writer.write(baseGeom);
        const individualFeature = turf.feature(individualGeoJSON);
        const individualLayer = createLeafletLayer(individualFeature, individualStyle);
        if (individualLayer) {
             individualLayer.addTo(map);
             areas.push({ name: individualName, layer: individualLayer });
             addAreaCheckbox(individualName, individualLayer, false); // Começa desmarcado
        }

        return baseGeom;
    });

    // 3. Unir todas as áreas processadas em uma única geometria final
    let finalCombinedGeom = processedGeoms[0];
    for (let i = 1; i < processedGeoms.length; i++) {
        finalCombinedGeom = finalCombinedGeom.union(processedGeoms[i]);
    }
    
    const finalBaseAreaGeoJSON = writer.write(finalCombinedGeom);
    const finalCombinedFeature = turf.feature(finalBaseAreaGeoJSON);

    // 4. Desenhar a área de serviço final combinada
    // const baseStyle = { color: '#0066ff', fillColor: '#0066ff', fillOpacity: 0.2, weight: 2 };
    // const baseName = "Área de Atendimento Total";
    // const baseLayer = createLeafletLayer(finalCombinedFeature, baseStyle);
    // if (baseLayer) {
    //     baseLayer.addTo(map);
    //     areas.push({ name: baseName, layer: baseLayer });
    //     addAreaCheckbox(baseName, baseLayer);
    // }
    
    // 5. Processar o Ponto de Origem e Raios contra a área combinada
    const centerLatLng = pointFeature.geometry.coordinates;
    const centerLngLat = [centerLatLng[1], centerLatLng[0]];
    L.marker(centerLatLng).addTo(map);

    const radiusData = pointFeature.properties.radius_mode || [];
    radiusData.forEach(radiusInfo => {
        const circle = turf.circle(centerLngLat, radiusInfo.radius, { units: 'kilometers' });
        try {
            const circleGeom = reader.read(circle.geometry);

            // Obter apenas a linha da circunferência do raio
            const circleBoundary = circleGeom.getBoundary();

            // Verificar se a área de serviço intercepta a LINHA do raio
            if (finalCombinedGeom.intersects(circleBoundary)) {
                // VÁLIDO: A circunferência cruza a área. Desenhar a interseção das ÁREAS para mostrar a zona de entrega.
                const intersectionGeom = finalCombinedGeom.intersection(circleGeom);
                const intersectionGeoJSON = writer.write(intersectionGeom);
                const intersectionFeature = turf.feature(intersectionGeoJSON);
                
                const radiusStyle = { color: 'green', fillColor: 'green', fillOpacity: 0.1 };
                const radiusName = `${radiusInfo.radius} KM - R$${radiusInfo.delivery_fee.toFixed(2)}`;
                const intersectionLayer = createLeafletLayer(intersectionFeature, radiusStyle);
                if (intersectionLayer) {
                    intersectionLayer.addTo(map);
                    areas.push({ name: radiusName, layer: intersectionLayer });
                    addAreaCheckbox(radiusName, intersectionLayer);
                }
            } else {
                // INVÁLIDO: A circunferência está inteiramente fora da área de serviço. Desenhar o círculo completo com estilo de "Fora da Área".
                const noIntersectionStyle = { color: 'red', weight: 2, fillOpacity: 0.1, dashArray: '10, 10' };
                const radiusName = `${radiusInfo.radius} KM - R$${radiusInfo.delivery_fee.toFixed(2)} (Fora da Área)`;
                const circleLayer = createLeafletLayer(circle, noIntersectionStyle);
                if (circleLayer) {
                    circleLayer.addTo(map);
                    areas.push({ name: radiusName, layer: circleLayer });
                    addAreaCheckbox(radiusName, circleLayer, false); 
                }
            }
        } catch(e) {
            console.error(`Falha na interseção para o raio de ${radiusInfo.radius}KM.`, e);
        }
    });
    
    // Ajustar zoom
    if (areas.length > 0) {
        const visibleLayers = areas.filter((a, i) => document.querySelectorAll('.area-item input[type="checkbox"]')[i].checked).map(a => a.layer);
        if (visibleLayers.length > 0) {
            const group = new L.featureGroup(visibleLayers);
            map.fitBounds(group.getBounds().pad(0.1));
        }
    }
}

function exportToKML() {
    let kml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    kml += '<kml xmlns="http://www.opengis.net/kml/2.2">\n';
    kml += '  <Document>\n';
    kml += '    <name>Áreas de Entrega</name>\n';
    areas.forEach((area, index) => {
        const checkbox = document.querySelectorAll('.area-item input[type="checkbox"]')[index];
        if (area.layer instanceof L.Polygon && checkbox && checkbox.checked) {
            const latlngs = area.layer.getLatLngs();
            const isMulti = area.layer.getLatLngs().length > 1 && Array.isArray(area.layer.getLatLngs()[0][0]);
            const polygons = isMulti ? latlngs : [latlngs];
            
            polygons.forEach(polygonRings => {
                 const outerRing = polygonRings[0];
                 if (!outerRing) return;
                 const coordinates = outerRing.map(latlng => `${latlng.lng},${latlng.lat},0`).join(' ');
                 kml += '    <Placemark>\n';
                 kml += `      <name>${area.name}</name>\n`;
                 kml += '      <Polygon>\n';
                 kml += '        <outerBoundaryIs>\n';
                 kml += '          <LinearRing>\n';
                 kml += `            <coordinates>${coordinates}</coordinates>\n`;
                 kml += '          </LinearRing>\n';
                 kml += '        </outerBoundaryIs>\n';
                 kml += '      </Polygon>\n';
                 kml += '    </Placemark>\n';
            });
        }
    });
    kml += '  </Document>\n';
    kml += '</kml>\n';
    const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "areas.kml";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}