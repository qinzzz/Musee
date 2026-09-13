import ExpoModulesCore
import MapKit

public class MuseePlacesModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MuseePlaces")
    Constant("supportsMapView") { true }
    View(PlacesMapView.self) {
      Events("onPlaceSelect")
      Prop("places") { (view, places: [MapPlace]) in view.places = places }
      Prop("selectedId") { (view, id: String?) in view.selectedId = id }
      Prop("initialLocation") { (view, location: MapCoordinate?) in view.initialLocation = location }
      Prop("interactive") { (view, interactive: Bool) in view.map.isUserInteractionEnabled = interactive }
      OnViewDidUpdateProps { (view: PlacesMapView) in view.updateMap() }
    }
    AsyncFunction("search") { (query: String, latitude: Double?, longitude: Double?) async throws -> [[String: Any]] in
      return try await searchPlaces(query, latitude: latitude, longitude: longitude)
    }
    AsyncFunction("resolve") { (identifier: String) async throws -> [String: Any] in
      return try await resolvePlace(identifier)
    }
  }
}

struct MapCoordinate: Record {
  @Field var latitude: Double = 0
  @Field var longitude: Double = 0
  var coordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: latitude, longitude: longitude) }
}

struct MapPlace: Record {
  @Field var id: String = ""
  @Field var name: String = ""
  @Field var address: String = ""
  @Field var latitude: Double = 0
  @Field var longitude: Double = 0
}

private final class PlaceAnnotation: MKPointAnnotation {
  let placeId: String
  init(_ place: MapPlace) {
    placeId = place.id
    super.init()
    title = place.name
    subtitle = place.address
    coordinate = CLLocationCoordinate2D(latitude: place.latitude, longitude: place.longitude)
  }
}

final class PlacesMapView: ExpoView, MKMapViewDelegate {
  let map = MKMapView()
  let onPlaceSelect = EventDispatcher()
  var places: [MapPlace] = []
  var selectedId: String?
  var initialLocation: MapCoordinate?
  private var annotations: [PlaceAnnotation] = []
  private var lastPlacesKey = ""
  private var lastSelectedId: String?
  private var positioned = false
  private var updating = false

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    map.delegate = self
    map.showsUserLocation = false
    map.pointOfInterestFilter = .excludingAll
    map.isPitchEnabled = false
    map.isRotateEnabled = false
    map.accessibilityLabel = "Place search map"
    map.register(MKMarkerAnnotationView.self, forAnnotationViewWithReuseIdentifier: "place")
    addSubview(map)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    map.frame = bounds
  }

  func updateMap() {
    updating = true
    defer { updating = false }
    let validPlaces = places.filter {
      !$0.id.isEmpty && $0.latitude.isFinite && $0.longitude.isFinite &&
        CLLocationCoordinate2DIsValid(CLLocationCoordinate2D(latitude: $0.latitude, longitude: $0.longitude))
    }
    let key = validPlaces.map { "\($0.id)|\($0.name)|\($0.address)|\($0.latitude)|\($0.longitude)" }.joined(separator: "\n")
    let changed = key != lastPlacesKey
    if changed {
      map.removeAnnotations(annotations)
      var ids = Set<String>()
      annotations = validPlaces.filter { ids.insert($0.id).inserted }.map(PlaceAnnotation.init)
      map.addAnnotations(annotations)
      lastPlacesKey = key
    }
    if let selected = annotations.first(where: { $0.placeId == selectedId }) {
      if changed || lastSelectedId != selectedId {
        map.setRegion(MKCoordinateRegion(center: selected.coordinate,
          latitudinalMeters: 1800, longitudinalMeters: 1800), animated: positioned)
        map.selectAnnotation(selected, animated: false)
        positioned = true
      }
    } else {
      for annotation in map.selectedAnnotations { map.deselectAnnotation(annotation, animated: false) }
      if changed && !annotations.isEmpty {
        if annotations.count == 1, let point = annotations.first {
          map.setRegion(MKCoordinateRegion(center: point.coordinate,
            latitudinalMeters: 3000, longitudinalMeters: 3000), animated: positioned)
        } else {
          let rect = annotations.reduce(MKMapRect.null) { rect, annotation in
            let point = MKMapPoint(annotation.coordinate)
            return rect.union(MKMapRect(x: point.x, y: point.y, width: 1, height: 1))
          }
          map.setVisibleMapRect(rect, edgePadding: UIEdgeInsets(top: 45, left: 35, bottom: 45, right: 35), animated: positioned)
        }
        positioned = true
      } else if !positioned, let initial = initialLocation,
        initial.latitude.isFinite, initial.longitude.isFinite, CLLocationCoordinate2DIsValid(initial.coordinate) {
        map.setRegion(MKCoordinateRegion(center: initial.coordinate,
          latitudinalMeters: 10000, longitudinalMeters: 10000), animated: false)
        positioned = true
      }
    }
    lastSelectedId = selectedId
  }

  func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
    guard annotation is PlaceAnnotation else { return nil }
    let view = mapView.dequeueReusableAnnotationView(withIdentifier: "place", for: annotation)
    view.canShowCallout = true
    return view
  }

  func mapView(_ mapView: MKMapView, didSelect view: MKAnnotationView) {
    guard !updating, map.isUserInteractionEnabled,
      let annotation = view.annotation as? PlaceAnnotation, annotation.placeId != selectedId else { return }
    onPlaceSelect(["id": annotation.placeId])
  }
}

private let unsupported = NSError(domain: "MuseePlaces", code: 1,
  userInfo: [NSLocalizedDescriptionKey: "Place search requires iOS 18 or later. You can enter a place manually."])

@MainActor
private func searchPlaces(_ query: String, latitude: Double?, longitude: Double?) async throws -> [[String: Any]] {
  guard #available(iOS 18.0, *) else { throw unsupported }
  let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
  guard text.count >= 2 && text.count <= 300 else { return [] }
  let request = MKLocalSearch.Request()
  request.naturalLanguageQuery = text
  request.resultTypes = [.pointOfInterest, .address]
  if let lat = latitude, let lon = longitude, lat.isFinite, lon.isFinite,
     (-90...90).contains(lat), (-180...180).contains(lon) {
    request.region = MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: lat, longitude: lon),
      latitudinalMeters: 10000, longitudinalMeters: 10000)
  }
  let response = try await MKLocalSearch(request: request).start()
  return response.mapItems.prefix(12).compactMap(placeResult)
}

@MainActor
private func resolvePlace(_ identifier: String) async throws -> [String: Any] {
  guard #available(iOS 18.0, *) else { throw unsupported }
  guard let id = MKMapItem.Identifier(rawValue: identifier) else {
    throw NSError(domain: "MuseePlaces", code: 2,
      userInfo: [NSLocalizedDescriptionKey: "The saved place is unavailable."])
  }
  let item = try await MKMapItemRequest(mapItemIdentifier: id).mapItem
  guard let result = placeResult(item) else {
    throw NSError(domain: "MuseePlaces", code: 3,
      userInfo: [NSLocalizedDescriptionKey: "The saved place is unavailable."])
  }
  return result
}

@available(iOS 18.0, *)
@MainActor
private func placeResult(_ item: MKMapItem) -> [String: Any]? {
  guard let id = item.identifier?.rawValue, let name = item.name, !name.isEmpty else { return nil }
  let address = [item.placemark.thoroughfare, item.placemark.locality,
    item.placemark.administrativeArea, item.placemark.country].compactMap { $0 }.joined(separator: ", ")
  return ["id": id, "name": name, "address": address,
    "category": item.pointOfInterestCategory?.rawValue.replacingOccurrences(of: "MKPOICategory", with: "") ?? "Place",
    "latitude": item.placemark.coordinate.latitude, "longitude": item.placemark.coordinate.longitude]
}
