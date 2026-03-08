FROM public.ecr.aws/lambda/nodejs:22 AS builder

WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci

COPY tools/ tools/
COPY json/ json/
COPY tsconfig.json ./

ARG HANDLER
ARG BUILD_ENV=prod
COPY src/${HANDLER}/ src/${HANDLER}/
RUN mkdir -p generated && cp json/slack-config/${BUILD_ENV}.json generated/slack-config.json
RUN npx esbuild src/${HANDLER}/index.ts \
    --bundle \
    --platform=node \
    --outdir=out \
    --external:@aws-sdk/*

FROM public.ecr.aws/lambda/nodejs:22

COPY --from=builder /build/out/*.js ${LAMBDA_TASK_ROOT}/
CMD ["index.handler"]
