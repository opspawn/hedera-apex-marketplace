// Mock for file-type (ESM-only module) to allow Jest CJS execution
module.exports = {
  fileTypeFromBuffer: async () => undefined,
  fileTypeFromStream: async () => undefined,
};
