import { Router } from 'express';
import multer from 'multer';
import { converterController } from '../controllers/converter.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

router.post('/convert', upload.single('file'), (req, res, next) => converterController.convert(req, res, next));
router.post('/markdown-to-html', (req, res, next) => converterController.convertMarkdownToHTML(req, res, next));
router.post('/html-to-markdown', (req, res, next) => converterController.convertHTMLtoMarkdown(req, res, next));
router.post('/batch', upload.array('files', 20), (req, res, next) => converterController.batchConvert(req, res, next));
router.get('/history', (req, res, next) => converterController.listConversions(req, res, next));

export default router;
