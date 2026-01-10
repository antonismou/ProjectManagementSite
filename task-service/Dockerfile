FROM python:3.11-slim
WORKDIR /app
COPY main.py .
RUN pip install mysql-connector-python
EXPOSE 8082
CMD ["python", "main.py"]
