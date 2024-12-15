let areas = [];

const map = L.map('map', { editable: true }).setView([-27.634499, -48.621699], 13);
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
    coordinatesList = [];
};

document.getElementById('uploadButton').addEventListener('click', () => {
    clearMap();
    const areaList = document.getElementById('areaList');
    areaList.innerHTML = '';
    areas = [];

    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            const jsonData = JSON.parse(event.target.result);
            processJSON(jsonData);
        };
        reader.readAsText(file);
    } else {
        alert('Por favor, selecione um arquivo JSON.');
    }
});

document.getElementById('toKmlButton').addEventListener('click', () => {exportToKML(map);});

const fullscreenButton = document.getElementById('fullscreenButton');
fullscreenButton.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.getElementById('map').requestFullscreen();
    } else {
        document.exitFullscreen();
    }
});

document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
        fullscreenButton.style.display = 'none';
    } else {
        fullscreenButton.style.display = 'block';
    }
});

function addAreaCheckbox(areaName, layer) {
    const areaList = document.getElementById('areaList');
    const listItem = document.createElement('li');
    listItem.className = 'area-item';

    const listItemContent = document.createElement('div');
    listItemContent.style.display = 'flex';
    listItemContent.style.justifyContent = 'space-between';
    listItemContent.style.alignItems = 'center';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.onchange = function() {
        if (this.checked) {
            map.addLayer(layer);
            editButton.style.display = 'inline-block';
            editButton.textContent = 'Editar';
            editButton.disabled = false;
        } else {
            map.removeLayer(layer);
            layer.disableEdit();
            editButton.disabled = true;
        }
    };

    const editButton = document.createElement('button');
    editButton.textContent = 'Editar';
    editButton.className = 'button';
    editButton.style.marginLeft = '10px';
    editButton.style.cursor = 'pointer';
    editButton.style.display = 'inline-block';
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

    listItem.addEventListener('click', () => {
        document.querySelectorAll('.area-item').forEach(item => {
            item.classList.remove('selected');
        });
        listItem.classList.add('selected');
    });

    areaList.appendChild(listItem);
}

const colorList = ['blue', 'green', 'yelow']

function processJSON(data) {
    if (data.length < 2) {
        alert("Erro: O JSON deve conter pelo menos 2 geometrias.");
        return;
    }

    let colorIndex = 0;
    for (const index in data)
    {
        const geometryType = data[index].geometry.type
        switch (geometryType)
        {
            case "Polygon":
                const serviceAreaCoords = data[index].geometry.coordinates[0].map(coord => [coord[1], coord[0]]);
                const serviceArea = L.polygon(serviceAreaCoords, {
                    color: colorList[colorIndex],
                    fillColor: colorList[colorIndex],
                    fillOpacity: 0.5
                }).addTo(map);
                colorIndex++;
                
                areas.push({ name: data[index].properties.desc_store_district, layer: serviceArea });

                addAreaCheckbox(data[index].properties.desc_store_district, serviceArea);
                break;
            case "Point":
                const establishmentCoords = data[index].geometry.coordinates;
                const point = L.marker(establishmentCoords).addTo(map);

                map.setView([establishmentCoords[1], establishmentCoords[0]], 13); // Centraliza no marcador

                const bounds = [establishmentCoords];

                const radiusData = data[index].properties.radius_mode;
                radiusData.forEach(radiusInfo => {
                    const radiusPolygon = turf.circle([establishmentCoords[1], establishmentCoords[0]], radiusInfo.radius, {
                        steps: 32,
                        units: 'kilometers'
                    });

                    const circleCoords = radiusPolygon.geometry.coordinates[0].map(coord => [coord[1], coord[0]]);
                    const radiusElement = L.polygon(circleCoords, {
                        color: 'red',
                        fillColor: 'red',
                        fillOpacity: 0.1
                    }).addTo(map);


                    areas.push({ name: radiusInfo.radius + ' KM - ' + radiusInfo.delivery_fee, layer: radiusElement });
                    addAreaCheckbox(radiusInfo.radius + ' KM - ' + radiusInfo.delivery_fee, radiusElement);

                    bounds.push(...circleCoords);
                });

                const areaBounds = L.latLngBounds(bounds);
                map.fitBounds(areaBounds);
                break;
        }
    }
}

function exportToKML() {
    let kml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    kml += '<kml xmlns="http://www.opengis.net/kml/2.2">\n';
    kml += '  <Document>\n';
    kml += '    <name>Áreas</name>\n';
    kml += '    <description>Descrição das áreas</description>\n';

    map.eachLayer((layer) => {
        if (layer instanceof L.Polygon) {
            const index = areas.findIndex(area => area.layer === layer);
            if (index === -1) return;

            const checkbox = document.querySelectorAll('.area-item input[type="checkbox"]')[index];
            if (checkbox && checkbox.checked) {
                const areaName = areas[index].name;

                const latlngs = layer.getLatLngs()[0];
                const coordinates = latlngs.map(latlng => `${latlng.lng},${latlng.lat},0`).join(' ');

                kml += '    <Placemark>\n';
                kml += '      <name>' + areaName + '</name>\n';
                kml += '      <description></description>\n';
                kml += '      <Polygon>\n';
                kml += '        <outerBoundaryIs>\n';
                kml += '          <LinearRing>\n';
                kml += `            <coordinates>${coordinates}</coordinates>\n`;
                kml += '          </LinearRing>\n';
                kml += '        </outerBoundaryIs>\n';
                kml += '      </Polygon>\n';
                kml += '    </Placemark>\n';
            }
        }
    });

    kml += '  </Document>\n';
    kml += '</kml>\n';

    const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "areas.kml";
    a.click();
}
