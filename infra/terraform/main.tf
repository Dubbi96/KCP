terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "katab-terraform-state"
    key            = "kcp/terraform.tfstate"
    region         = "ap-northeast-2"
    dynamodb_table = "katab-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
}

# ---------------------------------------------------------------------------
# Remote state – shared infrastructure created by KCD's Terraform
# ---------------------------------------------------------------------------
data "terraform_remote_state" "kcd" {
  backend = "s3"

  config = {
    bucket = "katab-terraform-state"
    key    = "kcd/terraform.tfstate"
    region = var.aws_region
  }
}

# ---------------------------------------------------------------------------
# Locals
# ---------------------------------------------------------------------------
locals {
  name_prefix = "${var.project}-${var.environment}"

  tags = {
    Project     = var.project
    Environment = var.environment
    Component   = "kcp"
    ManagedBy   = "terraform"
  }
}
