import { Router } from 'express';
import multer from 'multer';
import { assetController } from '../controllers/asset.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

router.get('/', (req, res, next) => assetController.list(req, res, next));
router.post('/upload', upload.single('file'), (req, res, next) => assetController.upload(req, res, next));
router.get('/folders', (req, res, next) => assetController.getFolderTree(req, res, next));
router.post('/folders', (req, res, next) => assetController.createFolder(req, res, next));
router.get('/:id', (req, res, next) => assetController.get(req, res, next));
router.delete('/:id', (req, res, next) => assetController.delete(req, res, next));

export default router;
