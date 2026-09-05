import { Router, type IRouter } from "express";
import healthRouter from "./health";
import accountRouter from "./account";
import billingRouter from "./billing";
import reclaimRouter from "./reclaim";

const router: IRouter = Router();

router.use(healthRouter);
router.use(accountRouter);
router.use(reclaimRouter);
router.use(billingRouter);

export default router;
