ARG BUILD_FROM
FROM $BUILD_FROM

# Install node and npm
RUN apk add --no-cache nodejs npm

# Copy main app
COPY app /

# Copy start script for add-on
COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]