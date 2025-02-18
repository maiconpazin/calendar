import { prisma } from "@calcom/prisma";

import { TRPCError } from "@trpc/server";

import type { TrpcSessionUser } from "../../../trpc";
import type { TAdminVerifyInput } from "./adminVerify.schema";

type AdminVerifyOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
  input: TAdminVerifyInput;
};

export const adminVerifyHandler = async ({ input }: AdminVerifyOptions) => {
  const foundOrg = await prisma.team.findFirst({
    where: {
      id: input.orgId,
      isOrganization: true,
    },
    include: {
      members: {
        where: {
          role: "OWNER",
        },
        include: {
          user: true,
        },
      },
    },
  });

  if (!foundOrg)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This team isnt a org or doesnt exist",
    });

  const acceptedEmailDomain = foundOrg.members[0].user.email.split("@")[1];

  await prisma.organizationSettings.update({
    where: {
      organizationId: input.orgId,
    },
    data: {
      isOrganizationVerified: true,
    },
  });

  const foundUsersWithMatchingEmailDomain = await prisma.user.findMany({
    where: {
      email: {
        endsWith: acceptedEmailDomain,
      },
      teams: {
        some: {
          teamId: input.orgId,
        },
      },
    },
    select: {
      id: true,
      email: true,
    },
  });

  const userIds = foundUsersWithMatchingEmailDomain.map((user) => user.id);

  await prisma.$transaction([
    prisma.membership.updateMany({
      where: {
        userId: {
          in: userIds,
        },
        OR: [
          {
            team: {
              parentId: input.orgId,
            },
          },
          {
            teamId: input.orgId,
          },
        ],
      },
      data: {
        accepted: true,
      },
    }),
    prisma.user.updateMany({
      where: {
        id: {
          in: userIds,
        },
      },
      data: {
        organizationId: input.orgId,
      },
    }),
  ]);

  return {
    ok: true,
    message: `Verified Organization - Auto accepted all members ending in ${acceptedEmailDomain}`,
  };
};

export default adminVerifyHandler;
