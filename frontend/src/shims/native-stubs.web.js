// Shim for native-only libraries on web
module.exports = {
    // Camera
    Camera: () => null,
    useCameraDevice: () => null,
    useCameraPermission: () => ({ hasPermission: true, requestPermission: async () => true }),
    PhotoFile: {},
    TakePhotoOptions: {},

    // Background Remover
    removeBackground: async () => ({ uri: '' }),

    // Image Colors
    getColors: async () => ({ platform: 'web', background: '#ffffff', detail: '#000000', primary: '#cccccc', secondary: '#999999' }),

    // Camera Roll
    CameraRoll: {
        saveAsset: async () => ({ node: { image: { uri: '' } } }),
        getPhotos: async () => ({ edges: [] }),
    },

    // Keychain / Device ID
    ACCESSIBLE: {
        WHEN_UNLOCKED: 'WHEN_UNLOCKED',
        AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
        ALWAYS: 'ALWAYS',
        WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 'WHEN_PASSCODE_SET_THIS_DEVICE_ONLY',
        WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
        AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY',
        ALWAYS_THIS_DEVICE_ONLY: 'ALWAYS_THIS_DEVICE_ONLY',
    },
    setGenericPassword: async () => true,
    getGenericPassword: async () => null,
    resetGenericPassword: async () => true,

    // React Native FS (RNFS)
    CachesDirectoryPath: '',
    DocumentDirectoryPath: '',
    TemporaryDirectoryPath: '',
    ExternalDirectoryPath: '',
    MainBundlePath: '',
    RNFSFileTypeRegular: 'RNFSFileTypeRegular',
    RNFSFileTypeDirectory: 'RNFSFileTypeDirectory',
    RNFSManager: {
        RNFSFileTypeRegular: 'RNFSFileTypeRegular',
        RNFSFileTypeDirectory: 'RNFSFileTypeDirectory',
    },
    exists: async () => false,
    mkdir: async () => { },
    writeFile: async () => { },
    copyFile: async () => { },
    unlink: async () => { },
    readDir: async () => [],
    copyAssetsFileIOS: async () => { },

    // Image Resizer
    createResizedImage: async () => ({ uri: '', width: 0, height: 0, size: 0 }),
};
