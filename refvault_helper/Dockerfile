# RefVault helper for Home Assistant: the same tools Music Assistant uses for YouTube
# (yt-dlp + BgUtils proof-of-origin tokens), running on your home connection.
FROM python:3.12-slim
RUN pip install --no-cache-dir "yt-dlp[default]" bgutil-ytdlp-pot-provider youtube-transcript-api requests \
 && (pip install --no-cache-dir deno || echo "deno not available; yt-dlp runs without a JS runtime")
WORKDIR /app
COPY refvault_helper.py run.sh /app/
RUN chmod +x /app/run.sh
CMD ["/app/run.sh"]
