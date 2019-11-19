const fs = require('fs-extra');
const path = require('path');

class FilesHelper {
  constructor(config) {
    this.config = config;
  }

  readFile(filePath, encoding = 'utf8') {
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, encoding, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
  }

  getAllDirNames(dirPath) {
    if (fs.existsSync(dirPath)) {
      return fs.readdirSync(dirPath).filter(f => {
        return fs.statSync(path.join(dirPath, f)).isDirectory();
      });
    }
    return null;
  }

  getAllFileNames(dirPath) {
    if (fs.existsSync(dirPath)) {
      return fs.readdirSync(dirPath).filter(f => {
        return fs.statSync(path.join(dirPath, f)).isFile();
      });
    }
    return null;
  }

  fileExists(filePath) {
    return fs.existsSync(filePath);
  }

  async ensureDir(dirPath) {
    return await fs.ensureDir(dirPath);
  }

  unlinkFile(filePath) {
    if (filePath && this.fileExists(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  async moveFile(from, to, ensureDir = true) {
    if (ensureDir) {
      await this.ensureDir(path.dirname(to));
    }

    return await fs.rename(from, to);
  }

  getFileSize(filePath) {
    const stats = fs.statSync(filePath);
    return stats.size;
  }

  /**
   * It splits file name for given path into file name and file extension and returns array with 2 items.
   *
   * @param filePath
   *
   * @returns {Object} - { name: 'file name', extension: 'ext' }
   */
  getFileNameParts(filePath) {
    const { doubleFileExtensions } = this.config.server;
    const fileParts = {
      name: '',
      extension: '',
    };
    let doubleExtension = null;
    let fileName = path.basename(filePath);
    let fileAllParts = fileName.split('.');
    let fileExtension = fileAllParts.pop();

    // check if we have a double dot extension, i.e. .tar.gz
    if (doubleFileExtensions.indexOf(fileAllParts[fileAllParts.length - 1]) !== -1) {
      doubleExtension = fileAllParts.pop();
    }

    fileParts.name = fileAllParts.join('.');
    fileParts.extension = fileExtension;

    if (doubleExtension) {
      fileParts.extension = [doubleExtension, fileParts.extension].join('.');
    }

    // Just in case if file name didn't have extension at all
    if (!fileParts.name) {
      fileParts.name = fileParts.extension;
      fileParts.extension = '';
    }

    return fileParts;
  }
}

module.exports = FilesHelper;
