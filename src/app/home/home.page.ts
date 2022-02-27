import {Component, OnDestroy, OnInit} from '@angular/core';
import {Loader} from '@googlemaps/js-api-loader';
import wifiObjects from '../../data2/wifi.json';
import aqi from '../../data2/aqi.json';
import accidents from '../../data2/accidents.json';
import secrets from '../../data2/secrets.json';
import config from '../../data2/config.json';
import {FormControl, FormGroup, Validators} from '@angular/forms';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage implements OnInit, OnDestroy {
  // google maps zoom level
  zoom = 12;
  hotspots = wifiObjects;

  // initial center position for the map
  lat = config.lat;
  lng = config.lng;

  selectedLayer = config.selectedLayer;
  selectedAQI = config.selectedAQI;

  modeOfTransport = config.modeOfTransport;

  poiMap: google.maps.Map;
  accessibilityMap: google.maps.Map;
  wifiMap: google.maps.Map;
  airMap: google.maps.Map;

  directionService: google.maps.DirectionsService;
  directionRenderer: google.maps.DirectionsRenderer;
  wifiPois: google.maps.Circle[] = [];
  accidentPois: google.maps.Circle[] = [];
  placeMarker: google.maps.Marker;

  routeForm: FormGroup;
  placeForm: FormGroup;

  routeToleranceAccidents = 0.0002;
  routeToleranceWifi = 0.0005;
  placeRadius = 250;
  wifiRadius = 50;

  poiLightInjuryStat;
  poiSevereInjuryStat;
  poiDeathStat;
  poiWifiStat;
  wifiStat;
  accessibilityStat;
  routeDistanceStat;
  routeDurationStat;
  routeSafetyStat;

  constructor() {

  }

  ngOnDestroy(): void {

  }

  ngOnInit(): void {
    const loader = new Loader({
      apiKey: secrets.mapsApiKey,
      version: 'weekly',
    });

    loader.load().then(() => {
      this.directionService = new google.maps.DirectionsService();
      this.directionRenderer = new google.maps.DirectionsRenderer();

      this.accessibilityMap = new google.maps.Map(document.getElementById('accessibilityMap') as HTMLElement, {
        center: {lat: this.lat, lng: this.lng},
        zoom: this.zoom,
        streetViewControl: false,
      });

      this.wifiMap = new google.maps.Map(document.getElementById('wifiMap') as HTMLElement, {
        center: {lat: this.lat, lng: this.lng},
        zoom: this.zoom,
        streetViewControl: false,
      });

      this.airMap = new google.maps.Map(document.getElementById('airMap') as HTMLElement, {
        center: {lat: this.lat, lng: this.lng},
        zoom: this.zoom,
        streetViewControl: false,
      });

      this.poiMap = new google.maps.Map(document.getElementById('poiMap') as HTMLElement, {
        center: {lat: this.lat, lng: this.lng},
        zoom: this.zoom,
        streetViewControl: false,
      });

      this.directionRenderer.setMap(this.poiMap);

      this.initializeWifiMap();
      this.initializeAirMap();
    });

    this.routeForm = new FormGroup({
      start: new FormControl(null, {
        updateOn: 'change',
        validators: [Validators.required],
      }),
      destination: new FormControl(null, {
        updateOn: 'change',
        validators: [Validators.required],
      }),
    });

    this.placeForm = new FormGroup({
      place: new FormControl(null, {
        updateOn: 'change',
        validators: [Validators.required],
      })
    });

    this.wifiStat = wifiObjects.length;
  }

  selectLayer($event) {
    this.selectedLayer = $event.target.value;
  }

  selectModeOfTransport($event) {
    this.modeOfTransport = $event.target.value;
  }

  displayRoute() {
    this.clearPois();

    let origin: string = this.routeForm.get('start').value;
    let destination: string = this.routeForm.get('destination').value;
    if (!origin.includes(config.defaultLocation)) origin += config.defaultLocation;
    if (!destination.includes(config.defaultLocation)) destination += config.defaultLocation;
    const filter = {
      // filter by month, day of week, etc...
    }
    const gmaps = google.maps;

    let travelMode: google.maps.TravelMode;
    if (this.modeOfTransport === 'bike') {
      travelMode = gmaps.TravelMode.BICYCLING;
    } else if (this.modeOfTransport === 'car') {
      travelMode = gmaps.TravelMode.DRIVING;
    } else {
      travelMode = gmaps.TravelMode.WALKING;
    }

    this.directionService.route({
      origin,
      destination,
      travelMode,
    }, (result) => {
      this.directionRenderer.setDirections(result);
      const path = gmaps.geometry.encoding.decodePath(result.routes[0].overview_polyline);
      const polyline = new gmaps.Polyline({path});

      let safetyscore = 0;
      let length = result.routes[0].legs[0].distance.value;
      let distanceText = result.routes[0].legs[0].distance.text;
      let durationText = result.routes[0].legs[0].duration.text;

      this.routeDistanceStat = distanceText;
      this.routeDurationStat = durationText;

      let lightInjuries = 0;
      let severeInjuries = 0;
      let deaths = 0;

      // Check for accidents on route
      for (const accident of accidents) {
        const lat = parseFloat(accident['lat']);
        const lng = parseFloat(accident['lng']);
        const category = parseInt(accident['category']);
        const location = new gmaps.LatLng(lat, lng);

        if (gmaps.geometry.poly.isLocationOnEdge(location, polyline, this.routeToleranceAccidents)) {
          safetyscore += 4 - category;
          switch (category) {
            case 1:
              deaths++;
              break;
            case 2:
              severeInjuries++;
              break;
            case 3:
              lightInjuries++;
              break;
          }
          this.accidentPois.push(this.createAccidentMarker(location, category));
        }
      }

      this.poiLightInjuryStat = lightInjuries;
      this.poiSevereInjuryStat = severeInjuries;
      this.poiDeathStat = deaths;

      safetyscore /= length;
      safetyscore *= 1000;
      this.routeSafetyStat = safetyscore;

      let wifiHotspots = 0;

      for (const wifiHotspot of wifiObjects) {
        const location = new gmaps.LatLng(wifiHotspot);
        if (gmaps.geometry.poly.isLocationOnEdge(location, polyline, this.routeToleranceWifi)) {
          wifiHotspots++;
          this.wifiPois.push(this.createWifiMarker(location, this.poiMap));
        }
      }

      this.poiWifiStat = wifiHotspots;
    });
  }

  showPlacePois() {
    this.clearPois();
    this.selectedLayer = 'poi';

    let place = this.placeForm.get('place').value;
    if (!place.includes(config.defaultLocation)) place += ' ' + config.defaultLocation;
    const gmaps = google.maps;

    const geocoder = new gmaps.Geocoder();
    geocoder.geocode({'address': place}, (results, status) => {
      if (status === 'OK') {
        place = results[0].geometry.location;

        this.poiMap.setCenter(place);
        this.poiMap.setZoom(18);

        this.placeMarker = new google.maps.Marker({
          position: place,
          map: this.poiMap,
          title: results[0].formatted_address,
        });

        let lightInjuries = 0;
        let severeInjuries = 0;
        let deaths = 0;

        // Check for accidents in vicinity
        for (const accident of accidents) {
          const lat = parseFloat(accident['lat']);
          const lng = parseFloat(accident['lng']);
          const category = parseInt(accident['category']);
          const location = new gmaps.LatLng(lat, lng);

          if (gmaps.geometry.spherical.computeDistanceBetween(location, place) <= this.placeRadius) {
            switch (category) {
              case 1:
                deaths++;
                break;
              case 2:
                severeInjuries++;
                break;
              case 3:
                lightInjuries++;
                break;
            }
            this.accidentPois.push(this.createAccidentMarker(location, category));
          }
        }

        this.poiLightInjuryStat = lightInjuries;
        this.poiSevereInjuryStat = severeInjuries;
        this.poiDeathStat = deaths;

        let wifiHotspots = 0;

        for (const wifiHotspot of wifiObjects) {
          const location = new gmaps.LatLng(wifiHotspot);
          if (gmaps.geometry.spherical.computeDistanceBetween(location, place) <= this.placeRadius) {
            wifiHotspots++;
            this.wifiPois.push(this.createWifiMarker(location, this.poiMap));
          }
        }

        this.poiWifiStat = wifiHotspots;
      }
    });
  }

  private clearPois() {
    if (this.placeMarker) {
      this.poiMap.setZoom(this.zoom);
      this.placeMarker.setMap(null);
    }

    for (const wifiCircle of this.wifiPois) {
      wifiCircle.setMap(null);
    }

    for (const accidentCircle of this.accidentPois) {
      accidentCircle.setMap(null);
    }

    this.placeMarker = null;
    this.wifiPois = [];
    this.accidentPois = [];
  }

  private createAccidentMarker(location, category = 1) {
    let fillColor;
    switch (category) {
      case 1:
        fillColor = 'red';
        break;
      case 2:
        fillColor = 'orangered';
        break;
      case 3:
        fillColor = 'orange';
        break;
    }
    return new google.maps.Circle({
      strokeColor: fillColor,
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor,
      fillOpacity: 0.35,
      map: this.poiMap,
      center: location,
      radius: 10,
    });
  }

  private createWifiMarker(location: google.maps.LatLng, map: google.maps.Map) {
    return new google.maps.Circle({
      strokeColor: 'deepskyblue',
      strokeOpacity: 0.5,
      strokeWeight: 2,
      fillColor: 'DeepSkyBlue',
      fillOpacity: 0.35,
      map,
      center: location,
      radius: this.wifiRadius,
    });
  }

  private initializeWifiMap() {
    this.wifiStat = this.hotspots.length;
    for (const hotspot of this.hotspots) {
      const pos = new google.maps.LatLng(hotspot.lat, hotspot.lng);
      this.createWifiMarker(pos, this.wifiMap);
    }
  }

  private initializeAirMap() {
    for (const data of aqi) {
      const pos = {lat: parseFloat(data.lat), lng: parseFloat(data.lon)};
      const maxValue = Math.max(
        parseFloat(data.pm10),
        parseFloat(data.o3 ? data.o3 : '0'),
        parseFloat(data.no2 ? data.no2 : '0')
      );
      const color = this.translateAirQualityValueIntoColor(maxValue);
      const circle = new google.maps.Circle({
        strokeColor: color,
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: color,
        fillOpacity: 0.35,
        map: this.airMap,
        center: pos,
        radius: 625,
        clickable: true,
      });
      circle.addListener('click', (event) => {
        this.selectedAQI = data;
      });
    }
  }

  private translateAirQualityValueIntoColor(value: number) {
    if (value <= 50) {
      return 'green';
    }
    if (value <= 100) {
      return 'yellow';
    }
    if (value <= 200) {
      return 'orange';
    }
    if (value <= 300) {
      return 'red';
    }
    if (value <= 400) {
      return 'darkred';
    }
    return 'black';
  }

  get wifiLayerActive() {
    return this.selectedLayer === 'wifi';
  }

  get safetyLayerActive() {
    return this.selectedLayer === 'safety';
  }

  get accessibilityLayerActive() {
    return this.selectedLayer === 'accessibility';
  }

  get airLayerActive() {
    return this.selectedLayer === 'air';
  }

  get poiLayerActive() {
    return this.selectedLayer === 'poi';
  }

  get routeActive() {
    return this.directionRenderer != null && this.directionRenderer.getDirections() != null
  }

  get placeActive() {
    return this.placeMarker != null;
  }

  get pm25Active() {
    return this.selectedAQI != null && 'pm25' in this.selectedAQI;
  }

  get pm10Active() {
    return this.selectedAQI != null && 'pm10' in this.selectedAQI;
  }

  get pm1Active() {
    return this.selectedAQI != null && 'pm1' in this.selectedAQI;
  }

  get o3Active() {
    return this.selectedAQI != null && 'o3' in this.selectedAQI;
  }

  get no2Active() {
    return this.selectedAQI != null && 'no2' in this.selectedAQI;
  }
}
