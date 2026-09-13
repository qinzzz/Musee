Pod::Spec.new do |s|
  s.name = 'MuseePlaces'
  s.version = '1.0.0'
  s.summary = 'Musee Apple Maps place search'
  s.description = 'Local Expo module for transient MapKit search and saved place identifiers.'
  s.license = { :type => 'Proprietary' }
  s.author = 'Musee'
  s.homepage = 'https://www.museelab.com'
  s.source = { :path => '.' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'MapKit'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
