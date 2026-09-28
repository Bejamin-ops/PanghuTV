platform :ios, '16.0'
use_frameworks! :linkage => :static
install! 'cocoapods', :warn_for_unused_master_specs_repo => false

target 'PanghuTV' do
  pod 'MobileVLCKit', '~> 3.6'
end

post_install do |installer|
  installer.pods_project.targets.each do |t|
    t.build_configurations.each do |config|
      config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
    end
  end
end
