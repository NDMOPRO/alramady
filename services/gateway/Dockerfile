FROM nginx:1.25-alpine

RUN apk add --no-cache curl

COPY default.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
