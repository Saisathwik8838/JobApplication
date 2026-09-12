const transitions = {
  DISCOVERED: ['ELIGIBLE', 'REJECTED'],
  ELIGIBLE: ['MATCHED', 'REJECTED'],
  MATCHED: ['APPLICATION_PREPARED', 'REJECTED'],
  APPLICATION_PREPARED: ['AWAITING_APPROVAL', 'NEEDS_USER_INPUT', 'MANUAL_INTERVENTION', 'REJECTED', 'MATCHED'],
  AWAITING_APPROVAL: ['APPROVED', 'REJECTED', 'NEEDS_USER_INPUT', 'MATCHED'],
  APPROVED: ['FILLING', 'SUBMITTING', 'REJECTED'],
  FILLING: ['FILLED_AWAITING_RECHECK', 'SUBMITTING', 'NEEDS_USER_INPUT', 'MANUAL_INTERVENTION', 'FAILED', 'REJECTED'],
  FILLED_AWAITING_RECHECK: ['RESUBMIT_APPROVED', 'APPROVED', 'REJECTED', 'MANUAL_INTERVENTION', 'APPLICATION_PREPARED'],
  RESUBMIT_APPROVED: ['SUBMITTING', 'REJECTED', 'MANUAL_INTERVENTION'],
  SUBMITTING: ['SUBMITTED', 'FAILED', 'MANUAL_INTERVENTION'],
  FAILED: ['APPROVED', 'RESUBMIT_APPROVED', 'REJECTED', 'SUBMITTED'],
  NEEDS_USER_INPUT: ['APPLICATION_PREPARED', 'FILLING', 'REJECTED', 'MATCHED'],
  MANUAL_INTERVENTION: ['APPLICATION_PREPARED', 'APPROVED', 'RESUBMIT_APPROVED', 'FAILED', 'REJECTED', 'SUBMITTED'],
  SUBMITTED: [],
  REJECTED: ['MATCHED']
};
export class InvalidStateTransitionError extends Error { constructor(from, to) { super(`Cannot transition application from ${from} to ${to}.`); this.name = 'InvalidStateTransitionError'; this.status = 409; this.code = 'INVALID_STATE_TRANSITION'; } }
/** @param {string} from @param {string} to */
export function assertTransition(from, to) { if (!transitions[from]?.includes(to)) throw new InvalidStateTransitionError(from, to); }
/** @param {import('@prisma/client').PrismaClient} prisma @param {string} applicationId @param {string} target @param {{eventType:string,message:string,metadata?:object}} event */
export async function transitionApplication(prisma, applicationId, target, event) {
  return prisma.$transaction(async (tx) => {
    const application = await tx.application.findUnique({ where: { id: applicationId } });
    if (!application) {
      const error = new Error('Application not found.');
      error.status = 404;
      throw error;
    }
    assertTransition(application.status, target);

    const updateData = { status: target };
    if (target === 'MANUAL_INTERVENTION' || target === 'FAILED') {
      updateData.error = event.message || 'Manual intervention required';
    } else if (target === 'SUBMITTED') {
      updateData.error = null;
    }

    const updated = await tx.application.update({
      where: { id: applicationId },
      data: updateData,
    });
    await tx.applicationEvent.create({
      data: {
        applicationId,
        eventType: event.eventType,
        status: target,
        message: event.message,
        metadata: event.metadata,
      },
    });
    return updated;
  });
}
